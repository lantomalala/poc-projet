/**
 * config.js
 * Central configuration for the crawler.
 *
 * Tweak the values here to control scraping behaviour without touching
 * any other file. All tuneable knobs are documented below.
 */

module.exports = {
  // ---------------------------------------------------------------------------
  // Target
  // ---------------------------------------------------------------------------

  /** Entry point URL — where the crawl begins. */
  START_URL: 'https://www.extra.com.br/',

  /**
   * Only URLs whose hostname matches (or is a subdomain of) this string
   * will be followed. External links are silently discarded.
   */
  TARGET_DOMAIN: 'extra.com.br',

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  /**
   * Root directory where downloaded pages are saved.
   * Follows the same folder hierarchy as the URL path:
   *   https://extra.com.br/tv/4k/ → crawl/extra.com.br/tv/4k/index.html
   */
  OUTPUT_DIR: 'crawl',

  // ---------------------------------------------------------------------------
  // Concurrency & rate limiting
  // ---------------------------------------------------------------------------

  /**
   * Number of pages crawled in parallel (Axios core).
   * Keep this low (3–8) to be polite and avoid triggering rate limits.
   */
  CONCURRENCY: 5,

  /**
   * Number of Chrome tabs opened simultaneously (Puppeteer core).
   * Each tab uses ~150–200 MB of RAM, so keep this modest (1–3).
   */
  PUPPETEER_CONCURRENCY: 2,

  /**
   * Minimum wait between batches of requests (ms).
   * Acts as a "politeness delay" so we don't hammer the server.
   */
  BATCH_DELAY: 600,

  // ---------------------------------------------------------------------------
  // Limits
  // ---------------------------------------------------------------------------

  /** HTTP / navigation timeout for a single request, in milliseconds. */
  REQUEST_TIMEOUT: 20_000,

  /**
   * Maximum crawl depth relative to START_URL.
   * 0 = unlimited (crawl everything reachable).
   * 1 = only the start page.
   * 2 = start page + all links from it.
   */
  MAX_DEPTH: 0,

  /**
   * Hard cap on total pages crawled.
   * 0 = unlimited.
   * Useful during testing to avoid accidentally crawling a whole site.
   */
  MAX_PAGES: 0,

  // ---------------------------------------------------------------------------
  // HTTP identity
  // ---------------------------------------------------------------------------

  /**
   * User-Agent string sent with every Axios request (and used in Puppeteer).
   * Looks like a real Chrome browser on Windows to avoid basic bot checks.
   */
  USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/124.0.0.0 Safari/537.36',

  /**
   * Extra HTTP headers attached to every Axios request.
   * Puppeteer sets similar headers via page.setExtraHTTPHeaders().
   */
  DEFAULT_HEADERS: {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    DNT: '1',
  },
};
