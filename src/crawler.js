/**
 * crawler.js
 * Core crawling engine.
 *
 * Implements a breadth-first crawl using an async queue bounded by a
 * concurrency limiter (p-limit). This avoids the deep call stack that
 * a naive recursive approach would create on large sites.
 *
 * Two scraping cores are used transparently via fetcher.js:
 *   - Axios      → fast, stateless HTTP requests (most pages)
 *   - Puppeteer  → full Chrome browser (JS-gated or bot-protected pages)
 *
 * The crawler logs which core handled each page so you can monitor the
 * split at a glance.
 */

const pLimit = require('p-limit');
const { fetchPage } = require('./fetcher');
const { closeBrowser } = require('./browserCore');
const { extractLinks } = require('./parser');
const { savePage, pageExists } = require('./storage');
const { resolveUrl } = require('./urlUtils');
const logger = require('./logger');
const {
  CONCURRENCY,
  BATCH_DELAY,
  MAX_DEPTH,
  MAX_PAGES,
  START_URL,
} = require('./config');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** URLs that have already been enqueued or successfully crawled. */
const visited = new Set();

/**
 * Crawl statistics — updated throughout the run and printed at the end.
 * @type {{ visited: number, skipped: number, errors: number, axiosHits: number, puppeteerHits: number, startTime: number, duration?: number }}
 */
const stats = {
  visited: 0,
  skipped: 0,
  errors: 0,
  axiosHits: 0,
  puppeteerHits: 0,
  startTime: Date.now(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sleeps for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns true when a page cap is set and has been hit.
 * @returns {boolean}
 */
function pageLimitReached() {
  return MAX_PAGES > 0 && stats.visited >= MAX_PAGES;
}

// ---------------------------------------------------------------------------
// Single-page crawl
// ---------------------------------------------------------------------------

/**
 * Crawls one URL:
 *  1. Skips it if we already have a saved copy (resume-friendly).
 *  2. Fetches the HTML via the best available core (Axios or Puppeteer).
 *  3. Persists the HTML to disk.
 *  4. Extracts and returns child links for BFS expansion.
 *
 * @param {string} url    Absolute URL to crawl.
 * @param {number} depth  Crawl depth (0 = start URL).
 * @returns {Promise<string[]>}  New URLs discovered on this page.
 */
async function crawlPage(url, depth) {
  logger.visit(url, depth);
  stats.visited++;

  try {
    // Skip if we already saved this page during a previous run (resume mode)
    if (await pageExists(url)) {
      logger.skip(url, 'already saved (resuming previous crawl)');
      stats.skipped++;
      return [];
    }

    const { html, finalUrl, core } = await fetchPage(url);

    // Track which scraping core was responsible
    if (core === 'axios') {
      stats.axiosHits++;
      logger.coreUsed(url, 'axios');
    } else {
      stats.puppeteerHits++;
      logger.coreUsed(url, 'puppeteer');
    }

    // If the server redirected us, mark the destination as visited too
    // so we don't revisit it from a different path.
    const canonical = resolveUrl(finalUrl, finalUrl) ?? url;
    if (canonical !== url && !visited.has(canonical)) {
      visited.add(canonical);
    }

    // Save HTML to disk
    const { filePath, size } = await savePage(canonical, html);
    logger.saved(filePath, size);

    // Pull out internal links for BFS
    const childLinks = extractLinks(html, canonical);
    return childLinks;
  } catch (err) {
    logger.error(url, err);
    stats.errors++;
    return [];
  }
}

// ---------------------------------------------------------------------------
// BFS queue runner
// ---------------------------------------------------------------------------

/**
 * Runs the complete crawl starting from START_URL.
 *
 * Algorithm: iterative BFS with p-limit concurrency control.
 *  - A queue of { url, depth } items drives exploration.
 *  - Items are processed in batches; each batch runs in parallel up to
 *    CONCURRENCY simultaneous requests.
 *  - Discovered links are appended to the back of the queue.
 *  - A polite delay between batches prevents hammering the server.
 *
 * @returns {Promise<void>}
 */
async function runCrawl() {
  const limit = pLimit(CONCURRENCY);

  /** @type {Array<{ url: string, depth: number }>} */
  const queue = [];

  // Seed the queue with the starting URL
  const startUrl = resolveUrl(START_URL, START_URL) ?? START_URL;
  visited.add(startUrl);
  queue.push({ url: startUrl, depth: 0 });

  const { REQUEST_TIMEOUT } = require('./config');
  logger.info(`Starting crawl from ${startUrl}`);
  logger.info(`Concurrency: ${CONCURRENCY} | Timeout: ${REQUEST_TIMEOUT}ms`);
  logger.info(`Cores: Axios (primary) + Puppeteer/Chrome (fallback)`);

  try {
    while (queue.length > 0) {
      if (pageLimitReached()) {
        logger.info(`Page limit (${MAX_PAGES}) reached — stopping.`);
        break;
      }

      // Pull the next batch from the front of the queue
      const batch = queue.splice(0, CONCURRENCY);

      const results = await Promise.allSettled(
        batch.map(({ url, depth }) =>
          limit(async () => {
            if (pageLimitReached()) return null;
            const childLinks = await crawlPage(url, depth);
            return { childLinks, depth };
          })
        )
      );

      // Enqueue newly discovered child URLs
      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue;

        const { childLinks, depth } = result.value;
        const nextDepth = depth + 1;

        // Don't go deeper than MAX_DEPTH (0 = unlimited)
        if (MAX_DEPTH > 0 && nextDepth > MAX_DEPTH) {
          for (const link of childLinks) {
            if (!visited.has(link)) {
              logger.skip(link, `depth limit (${MAX_DEPTH})`);
              stats.skipped++;
              visited.add(link);
            }
          }
          continue;
        }

        for (const link of childLinks) {
          if (!visited.has(link)) {
            if (pageLimitReached()) {
              logger.skip(link, 'page limit reached');
              stats.skipped++;
            } else {
              visited.add(link);
              queue.push({ url: link, depth: nextDepth });
            }
          }
        }
      }

      // Polite pause between batches
      if (queue.length > 0 && BATCH_DELAY > 0) {
        await sleep(BATCH_DELAY);
      }
    }
  } finally {
    // Always close the browser cleanly, even on error or SIGINT
    await closeBrowser();
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { runCrawl, stats };
