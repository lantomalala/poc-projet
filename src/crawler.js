/**
 * crawler.js
 *
 * BFS crawl engine — 1000-page limit, Axios-only, blacklist-aware.
 *
 * Key behaviours:
 *  ─ Breadth-first crawl seeded from START_URL.
 *  ─ Pages already saved on disk are SKIPPED (resume-friendly).
 *  ─ When the server blacklists us (403 / 429 / 503 / JS-gate):
 *      • The URL is placed into a RETRY QUEUE with an exponential backoff.
 *      • Normal crawling continues uninterrupted.
 *      • Blacklisted URLs are ONLY re-fetched when their backoff timer expires.
 *      • After BLACKLIST_MAX_RETRIES failures the URL is dropped with an error.
 *  ─ State is persisted to crawl.work after every batch (resumable).
 *  ─ All events are logged to crawl.log via logger.js.
 */

'use strict';

const pLimit  = require('p-limit');
const { fetchPage }  = require('./fetcher');
const { extractLinks } = require('./parser');
const { savePage, pageExists, readPage } = require('./storage');
const { resolveUrl } = require('./urlUtils');
const { saveWork, loadWork, clearWork } = require('./workFile');
const { initWarcFile, appendWarcRecord } = require('./warcWriter');
const logger = require('./logger');
const {
  CONCURRENCY,
  BATCH_DELAY,
  MAX_DEPTH,
  MAX_PAGES,
  START_URL,
  BLACKLIST_BACKOFF_MS,
  BLACKLIST_MAX_RETRIES,
  WARC_FILE,
} = require('./config');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** URLs already enqueued or successfully crawled (deduplication). */
let visited = new Set();

/**
 * Retry queue: URLs that were blacklisted are placed here with a "retry after"
 * timestamp. They are only re-attempted once their timer has elapsed.
 *
 * @type {Array<{ url: string, depth: number, attempt: number, retryAfter: number }>}
 */
let retryQueue = [];

/**
 * Crawl statistics — updated throughout the run.
 */
let stats = {
  visited:     0,
  saved:       0,
  skipped:     0,
  blacklisted: 0,
  retriedOk:   0,
  errors:      0,
  startTime:   Date.now(),
  duration:    0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pageLimitReached() {
  return MAX_PAGES > 0 && stats.visited >= MAX_PAGES;
}

/**
 * Calculates exponential backoff delay for a blacklisted retry attempt.
 * attempt 1 → 10 s, attempt 2 → 20 s, attempt 3 → 40 s …
 *
 * @param {number} attempt  1-based attempt index.
 * @returns {number}  Milliseconds to wait.
 */
function backoffMs(attempt) {
  return BLACKLIST_BACKOFF_MS * Math.pow(2, attempt - 1);
}

// ---------------------------------------------------------------------------
// Single-page crawl
// ---------------------------------------------------------------------------

/**
 * Crawls one URL.
 *  1. Skips if already saved on disk (resume mode).
 *  2. Fetches via Axios.
 *  3. On blacklist → pushes to retryQueue, returns [] (no child links).
 *  4. On success  → saves to disk, extracts child links.
 *
 * @param {string} url
 * @param {number} depth
 * @param {Array<{ url: string, depth: number }>} queue  Main BFS queue (for appending new links).
 * @returns {Promise<string[]>}  New child URLs discovered.
 */
async function crawlPage(url, depth, queue) {
  logger.visit(url, depth);
  stats.visited++;

  try {
    let html;
    let canonical = url;

    // Skip if we already saved this page (resume mode)
    if (await pageExists(url)) {
      logger.skip(url, 'already saved (resuming previous crawl)');
      stats.skipped++;
      
      // Load from local storage
      html = await readPage(url);
    } else {
      const { html: fetchedHtml, finalUrl } = await fetchPage(url);
      html = fetchedHtml;
      logger.coreUsed(url, 'axios');

      // If the server redirected us, also mark the destination visited
      canonical = resolveUrl(finalUrl, finalUrl) ?? url;
      if (canonical !== url && !visited.has(canonical)) {
        visited.add(canonical);
      }

      // Save HTML to disk
      const { filePath, size } = await savePage(canonical, html);
      logger.saved(filePath, size);
      stats.saved++;
    }

    // Append to WARC archive
    try {
      await appendWarcRecord(WARC_FILE, canonical, html);
    } catch (warcErr) {
      logger.error(canonical, new Error(`WARC write error: ${warcErr.message}`));
    }

    // Pull out internal links for BFS
    return extractLinks(html, canonical);

  } catch (err) {
    // ── Blacklisted: schedule a retry ────────────────────────────────────────
    if (err.isBlacklist) {
      const attempt = 1;
      const retryAfter = Date.now() + backoffMs(attempt);
      logger.blacklisted(url, err.status, attempt, BLACKLIST_MAX_RETRIES);
      stats.blacklisted++;
      // Put back into retry queue — do NOT count as a permanent error yet
      retryQueue.push({ url, depth, attempt, retryAfter });
      stats.visited--; // don't count the visit until it actually succeeds
      return [];
    }

    // ── Permanent error ───────────────────────────────────────────────────────
    logger.error(url, err);
    stats.errors++;
    return [];
  }
}

// ---------------------------------------------------------------------------
// Retry queue processor
// ---------------------------------------------------------------------------

/**
 * Processes all retry-queue entries whose backoff timer has expired.
 * Re-fetches them; on continued blacklist the backoff doubles and the entry
 * is re-queued until BLACKLIST_MAX_RETRIES is exhausted.
 *
 * @param {Array<{ url: string, depth: number }>} bfsQueue  Main BFS queue.
 * @returns {Promise<void>}
 */
async function processRetryQueue(bfsQueue) {
  if (retryQueue.length === 0) return;

  const now  = Date.now();
  const ready = retryQueue.filter((r) => r.retryAfter <= now);
  retryQueue  = retryQueue.filter((r) => r.retryAfter > now);

  if (ready.length === 0) return;

  logger.info(`Processing ${ready.length} retry-queue item(s)…`);

  for (const entry of ready) {
    if (pageLimitReached()) break;

    logger.info(
      `↩ Retrying blacklisted URL (attempt ${entry.attempt}/${BLACKLIST_MAX_RETRIES}): ${entry.url}`
    );

    try {
      const { html, finalUrl } = await fetchPage(entry.url);
      // Success after blacklist!
      stats.visited++;
      stats.retriedOk++;
      logger.retryOk(entry.url, entry.attempt);
      logger.coreUsed(entry.url, 'axios');

      const canonical = resolveUrl(finalUrl, finalUrl) ?? entry.url;
      if (canonical !== entry.url && !visited.has(canonical)) {
        visited.add(canonical);
      }

      const { filePath, size } = await savePage(canonical, html);
      logger.saved(filePath, size);
      stats.saved++;

      // Append to WARC archive
      try {
        await appendWarcRecord(WARC_FILE, canonical, html);
      } catch (warcErr) {
        logger.error(canonical, new Error(`WARC write error: ${warcErr.message}`));
      }

      // Enqueue discovered links from the retried page
      const links = extractLinks(html, canonical);
      for (const link of links) {
        if (!visited.has(link) && !pageLimitReached()) {
          visited.add(link);
          bfsQueue.push({ url: link, depth: entry.depth + 1 });
        }
      }

    } catch (err) {
      if (err.isBlacklist) {
        const nextAttempt = entry.attempt + 1;
        if (nextAttempt > BLACKLIST_MAX_RETRIES) {
          logger.error(entry.url, new Error(
            `Blacklisted ${BLACKLIST_MAX_RETRIES} times — giving up`
          ));
          stats.errors++;
        } else {
          const retryAfter = Date.now() + backoffMs(nextAttempt);
          logger.blacklisted(entry.url, err.status, nextAttempt, BLACKLIST_MAX_RETRIES);
          stats.blacklisted++;
          retryQueue.push({ ...entry, attempt: nextAttempt, retryAfter });
        }
      } else {
        logger.error(entry.url, err);
        stats.errors++;
      }
    }

    // Small pause between each retry to avoid hammering
    await sleep(1000);
  }
}

// ---------------------------------------------------------------------------
// BFS queue runner
// ---------------------------------------------------------------------------

/**
 * Runs the complete crawl starting from START_URL.
 *
 * If a crawl.work file exists the crawl resumes from the saved state;
 * otherwise it starts fresh from START_URL.
 *
 * @returns {Promise<void>}
 */
async function runCrawl() {
  const limit = pLimit(CONCURRENCY);

  // ── Load or initialise state ───────────────────────────────────────────────
  /** @type {Array<{ url: string, depth: number }>} */
  let queue;

  const saved = await loadWork();

  if (saved) {
    // Resume a previous crawl
    queue   = saved.queue;
    visited = saved.visited;
    // Merge previously accumulated stats (keep current startTime)
    stats = { ...stats, ...saved.stats, startTime: Date.now() };
    logger.info(`Resuming crawl — ${queue.length} URLs in queue, ${visited.size} already visited`);
  } else {
    // Fresh start
    queue = [];
    const startUrl = resolveUrl(START_URL, START_URL) ?? START_URL;
    visited.add(startUrl);
    queue.push({ url: startUrl, depth: 0 });
    logger.info(`Starting fresh crawl from ${startUrl}`);
  }

  logger.info(`Concurrency: ${CONCURRENCY} | Timeout: ${require('./config').REQUEST_TIMEOUT}ms`);
  logger.info(`Max pages: ${MAX_PAGES} | Blacklist retries: ${BLACKLIST_MAX_RETRIES}`);
  logger.info(`Work file: ${require('./config').WORK_FILE} | Log file: ${require('./config').LOG_FILE}`);

  // Initialize WARC file
  try {
    await initWarcFile(WARC_FILE);
  } catch (warcErr) {
    logger.error('warcInit', new Error(`Could not initialize WARC file: ${warcErr.message}`));
  }

  // ── Main BFS loop ──────────────────────────────────────────────────────────
  try {
    while (queue.length > 0 || retryQueue.length > 0) {
      // Check if we've hit the page limit
      if (pageLimitReached()) {
        logger.info(`Page limit (${MAX_PAGES}) reached — stopping.`);
        break;
      }

      // Process any retry entries that have elapsed their backoff timer
      await processRetryQueue(queue);

      // If the main queue is empty but retries are pending, wait a bit and loop
      if (queue.length === 0 && retryQueue.length > 0) {
        const nextRetry = Math.min(...retryQueue.map((r) => r.retryAfter));
        const waitMs    = Math.max(0, nextRetry - Date.now());
        if (waitMs > 0) {
          logger.info(`Main queue empty — waiting ${(waitMs / 1000).toFixed(0)}s for retry backoffs…`);
          await sleep(Math.min(waitMs, 5000)); // sleep at most 5 s at a time
        }
        continue;
      }

      // Pull the next batch from the front of the BFS queue
      const batch = queue.splice(0, CONCURRENCY);

      const results = await Promise.allSettled(
        batch.map(({ url, depth }) =>
          limit(async () => {
            if (pageLimitReached()) return null;
            const childLinks = await crawlPage(url, depth, queue);
            return { childLinks, depth };
          })
        )
      );

      // Enqueue newly discovered child URLs
      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue;

        const { childLinks, depth } = result.value;
        const nextDepth = depth + 1;

        // Respect MAX_DEPTH (0 = unlimited)
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

      // Persist state to .work file after every batch
      await saveWork(queue, visited, stats);

      // Polite pause between batches
      if ((queue.length > 0 || retryQueue.length > 0) && BATCH_DELAY > 0) {
        await sleep(BATCH_DELAY);
      }
    }
  } finally {
    // Nothing to clean up (no browser to close)
  }

  // If we finished cleanly (not interrupted), remove the .work file
  if (!pageLimitReached()) {
    await clearWork();
  } else {
    // Save final state so the next run can continue after the limit
    await saveWork(queue, visited, stats);
  }
}

module.exports = { runCrawl, getStats: () => stats };
