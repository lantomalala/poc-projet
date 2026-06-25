/**
 * browserCore.js
 *
 * Puppeteer-based scraping core — the "heavy artillery" used when Axios
 * can't fetch a page (JS-rendered content, anti-bot walls, CAPTCHAs, etc.).
 *
 * Design goals:
 *  - Maintain a single shared Browser instance (expensive to spin up).
 *  - Pool Page objects so we reuse tab slots instead of opening new ones.
 *  - Inject realistic browser fingerprints to avoid easy bot detection.
 *  - Simulate human interaction before harvesting HTML.
 *
 * Usage:
 *   const { fetchWithBrowser, closeBrowser } = require('./browserCore');
 *   const { html, finalUrl } = await fetchWithBrowser('https://example.com');
 *   await closeBrowser();  // call once at program exit
 */

const puppeteer = require('puppeteer');
const {
  randomDelay,
  naturalScroll,
  randomMouseWander,
  waitForIdle,
  dismissCookieBanners,
  randInt,
} = require('./humanBehavior');
const { REQUEST_TIMEOUT, USER_AGENT, PUPPETEER_CONCURRENCY } = require('./config');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Browser & page pool state
// ---------------------------------------------------------------------------

/** @type {import('puppeteer').Browser | null} */
let browser = null;

/** Pages that are currently idle and available for reuse. */
const idlePages = [];

/** How many pages are currently in use (checked out from pool). */
let activePages = 0;

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------

/**
 * Lazily starts the Chromium browser if it isn't already running.
 * Uses sensible stealth-friendly launch flags.
 *
 * @returns {Promise<import('puppeteer').Browser>}
 */
async function getBrowser() {
  if (browser && browser.connected) return browser;

  logger.info('🚀 Launching Chrome (Puppeteer core)…');

  browser = await puppeteer.launch({
    headless: true,          // Run hidden — change to false to watch it work
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',  // hide automation flag
      '--disable-infobars',
      '--window-size=1366,768',
      '--disable-notifications',
      '--disable-extensions',
      '--disable-dev-shm-usage',       // avoids /dev/shm too-small crashes
      '--no-first-run',
      '--lang=pt-BR,pt',               // match the site's expected locale
    ],
    defaultViewport: { width: 1366, height: 768 },
    ignoreHTTPSErrors: true,
  });

  browser.on('disconnected', () => {
    browser = null;
    idlePages.length = 0; // clear stale page references
    activePages = 0;
    logger.info('Browser disconnected — will re-launch on next request.');
  });

  return browser;
}

/**
 * Gracefully shuts down the shared browser instance.
 * Should be called once when the crawl finishes.
 */
async function closeBrowser() {
  if (!browser) return;
  try {
    await browser.close();
    logger.info('Chrome closed cleanly.');
  } catch (err) {
    logger.error('browser-close', err);
  } finally {
    browser = null;
    idlePages.length = 0;
    activePages = 0;
  }
}

// ---------------------------------------------------------------------------
// Page pool
// ---------------------------------------------------------------------------

/**
 * Retrieves an idle page from the pool, or opens a new one if the pool is
 * empty (up to PUPPETEER_CONCURRENCY simultaneous tabs).
 *
 * This prevents runaway tab counts while also avoiding the overhead of
 * creating a fresh page on every single request.
 *
 * @returns {Promise<import('puppeteer').Page>}
 */
async function getPage() {
  const b = await getBrowser();

  // Reuse an existing idle page when available
  if (idlePages.length > 0) {
    activePages++;
    return idlePages.pop();
  }

  // Open a fresh tab
  const page = await b.newPage();
  activePages++;
  await configurePage(page);
  return page;
}

/**
 * Returns a page to the idle pool after use, or closes it if the pool
 * already has enough spare tabs.
 *
 * @param {import('puppeteer').Page} page
 */
async function releasePage(page) {
  activePages = Math.max(0, activePages - 1);

  if (idlePages.length < PUPPETEER_CONCURRENCY) {
    // Navigate back to blank to reset state without paying new-tab cost
    try {
      await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 3000 });
      idlePages.push(page);
      return;
    } catch {
      // Navigation failed — just close it
    }
  }

  try {
    await page.close();
  } catch {
    // Already closed somehow — ignore
  }
}

// ---------------------------------------------------------------------------
// Page configuration (stealth & fingerprinting)
// ---------------------------------------------------------------------------

/**
 * Applies stealth tweaks and realistic browser fingerprints to a new page.
 *
 * @param {import('puppeteer').Page} page
 */
async function configurePage(page) {
  // Override the navigator.webdriver flag that Selenium/Puppeteer normally set
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // Fake a normal plugins array (empty plugins = bot red flag)
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5], // minimal fake; real sites don't inspect deeply
    });

    // Fake language array
    Object.defineProperty(navigator, 'languages', {
      get: () => ['pt-BR', 'pt', 'en-US', 'en'],
    });

    // Remove the automation chrome object
    // eslint-disable-next-line no-undef
    delete window.chrome; // some anti-bots look for this
    window.chrome = { runtime: {} };
  });

  // Use a believable User-Agent
  await page.setUserAgent(USER_AGENT);

  // Realistic Accept-Language header
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    DNT: '1',
  });

  // Intercept and abort resource types we don't need (speeds things up)
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    // Allow: document, script, xhr, fetch — block heavyweight media
    if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });
}

// ---------------------------------------------------------------------------
// Core fetch function
// ---------------------------------------------------------------------------

/**
 * Fetches a page using Puppeteer + Chrome, simulating human browsing behaviour.
 *
 * Steps:
 *  1. Get or create a page from the pool.
 *  2. Navigate to the URL.
 *  3. Wait for the page to settle (network idle).
 *  4. Dismiss cookie banners.
 *  5. Wander the mouse and scroll a bit.
 *  6. Extract the fully rendered HTML.
 *  7. Release the page back to the pool.
 *
 * @param {string} url  The URL to fetch.
 * @returns {Promise<{ html: string, finalUrl: string }>}
 * @throws {Error} If navigation or HTML extraction fails.
 */
async function fetchWithBrowser(url) {
  const page = await getPage();

  try {
    // Navigate — use 'domcontentloaded' first so we don't wait forever on
    // infinite-scroll sites; waitForIdle will catch the rest.
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: REQUEST_TIMEOUT,
    });

    const status = response ? response.status() : 0;

    // Treat 4xx/5xx as failures (except 429 which is rate-limited and retried
    // upstream in fetcher.js)
    if (status >= 400) {
      const err = new Error(`HTTP ${status}`);
      err.status = status;
      throw err;
    }

    // Let remaining XHR / lazy-load requests finish
    await waitForIdle(page, 6000);

    // Try to get rid of any cookie popup before we extract content
    await dismissCookieBanners(page);

    // A human wouldn't just sit still — move the mouse and scroll
    await randomMouseWander(page);
    await randomDelay(400, 900);
    await naturalScroll(page);
    await randomDelay(200, 600);

    // Capture the final rendered HTML (includes JS-injected content)
    const html = await page.content();
    const finalUrl = page.url();

    return { html, finalUrl };
  } finally {
    // Always return the page to the pool, even if we threw above
    await releasePage(page);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { fetchWithBrowser, closeBrowser, getBrowser };
