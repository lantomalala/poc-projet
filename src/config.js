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
   * Follows the same folder hierarchy as the URL path.
   */
  OUTPUT_DIR: 'crawl',

  /**
   * Path to the .warc file — compiles crawled pages into standard Web Archive format.
   */
  WARC_FILE: 'crawl.warc',

  /**
   * Path to the .work file — persists queue + visited state between runs.
   * Allows resuming a crawl from where it was interrupted.
   */
  WORK_FILE: 'crawl.work',

  /**
   * Path to the log file — all events are appended here during the run.
   */
  LOG_FILE: 'crawl.log',

  // ---------------------------------------------------------------------------
  // Concurrency & rate limiting
  // ---------------------------------------------------------------------------

  /**
   * Number of pages crawled in parallel (Axios core).
   * Keep this low (3–8) to be polite and avoid triggering rate limits.
   */
  CONCURRENCY: 5,

  /**
   * Minimum wait between batches of requests (ms).
   * Acts as a "politeness delay" so we don't hammer the server.
   */
  BATCH_DELAY: 800,

  /**
   * When blacklisted (429/503), wait this many milliseconds before retrying.
   * Multiplied by the retry attempt number (exponential-ish backoff).
   */
  BLACKLIST_BACKOFF_MS: 10_000,

  /**
   * Maximum number of retry attempts for a blacklisted URL.
   * À chaque tentative le proxy est automatiquement roté (voir proxyManager.js).
   */
  BLACKLIST_MAX_RETRIES: 3,

  // ---------------------------------------------------------------------------
  // Limits
  // ---------------------------------------------------------------------------

  /** HTTP navigation timeout for a single request, in milliseconds. */
  REQUEST_TIMEOUT: 20_000,

  /**
   * Maximum crawl depth relative to START_URL.
   * 0 = unlimited (crawl everything reachable).
   */
  MAX_DEPTH: 0,

  /**
   * Hard cap on total pages crawled.
   * 0 = unlimited.
   */
  MAX_PAGES: 50000,

  // ---------------------------------------------------------------------------
  // HTTP identity
  // ---------------------------------------------------------------------------

  /**
   * User-Agent string sent with every Axios request.
   * Looks like a real Chrome browser on Windows to avoid basic bot checks.
   */
  USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/124.0.0.0 Safari/537.36',

  /**
   * Extra HTTP headers attached to every Axios request.
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
