/**
 * fetcher.js
 *
 * The central HTTP fetching layer — acts as a smart dispatcher between
 * two scraping cores:
 *
 *   Core 1 — Axios   : Fast, lightweight, ideal for plain HTML pages.
 *   Core 2 — Puppeteer: Real Chrome instance, handles JS-rendered pages,
 *                        anti-bot challenges, lazy-loaded content, etc.
 *
 * Strategy:
 *  1. Try Axios first (quick and cheap).
 *  2. If Axios fails with a bot-detection-like status (403, 406, 429) or
 *     returns what looks like an empty/JS-gate page, fall through to
 *     Puppeteer automatically.
 *  3. Puppeteer retries once on transient network errors.
 *
 * This way the crawler is both fast on ordinary pages and resilient on
 * protected ones — without requiring manual configuration per URL.
 */

const axios = require('axios');
const { fetchWithBrowser } = require('./browserCore');
const { REQUEST_TIMEOUT, USER_AGENT, DEFAULT_HEADERS } = require('./config');
const logger = require('./logger');
const { randomDelay } = require('./humanBehavior');

// ---------------------------------------------------------------------------
// Axios client setup
// ---------------------------------------------------------------------------

/** HTTP status codes that are transient and worth retrying (Axios core). */
const AXIOS_RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * HTTP status codes that suggest the server is actively blocking us — a
 * signal that we should escalate to the browser core instead of retrying
 * with Axios (which would produce the same outcome).
 */
const BOT_BLOCK_STATUSES = new Set([403, 406, 407, 503]);

/** Max Axios retry attempts before escalating or giving up. */
const AXIOS_MAX_RETRIES = 2;

/**
 * Creates a shared Axios instance with sensible defaults:
 *   - Compressed responses (gzip/brotli)
 *   - Redirect following
 *   - Only 2xx treated as success
 */
function createAxiosClient() {
  return axios.create({
    timeout: REQUEST_TIMEOUT,
    headers: {
      'User-Agent': USER_AGENT,
      ...DEFAULT_HEADERS,
    },
    decompress: true,
    maxRedirects: 10,
    // Axios throws on non-2xx — we catch and inspect in fetchWithAxios()
    validateStatus: (status) => status >= 200 && status < 300,
  });
}

const axiosClient = createAxiosClient();

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Returns true if the HTML looks like a JavaScript-only "please wait" page
 * rather than real content — a common anti-scraping technique.
 *
 * Heuristics checked:
 *  - Very short body (likely a redirect shell or error page)
 *  - Presence of bot-detection script tags (Cloudflare, DataDome, etc.)
 *
 * @param {string} html
 * @returns {boolean}
 */
function looksLikeJsGate(html) {
  if (!html || html.length < 500) return true;

  const lower = html.toLowerCase();
  const jsGateMarkers = [
    'challenge-platform',       // Cloudflare
    '__cf_chl',                 // Cloudflare challenge
    'datadome',                 // DataDome bot manager
    'px.js',                    // PerimeterX
    '_pxhd',                    // PerimeterX cookie
    'recaptcha',                // reCAPTCHA gate
    'please enable javascript', // generic JS gate message
    'you need to enable javascript',
    'this site requires javascript',
  ];

  return jsGateMarkers.some((marker) => lower.includes(marker));
}

// ---------------------------------------------------------------------------
// Core 1 — Axios fetch
// ---------------------------------------------------------------------------

/**
 * Attempts to fetch a URL using the Axios HTTP client.
 *
 * Retries on transient server errors with an exponential backoff.
 * Throws with a `.escalate = true` flag when the server appears to be
 * blocking us, so the caller knows to try Puppeteer instead.
 *
 * @param {string} url
 * @param {number} [attempt=0]  Internal retry counter.
 * @returns {Promise<{ html: string, finalUrl: string, core: 'axios' }>}
 */
async function fetchWithAxios(url, attempt = 0) {
  try {
    const response = await axiosClient.get(url, { responseType: 'text' });

    const html = response.data;
    const finalUrl = response.request?.res?.responseUrl ?? url;

    // Even a 200 OK can be a JS gate — escalate to browser if so
    if (looksLikeJsGate(html)) {
      const err = new Error('Axios got a JS gate page — escalating to browser');
      err.escalate = true;
      throw err;
    }

    return { html, finalUrl, core: 'axios' };
  } catch (err) {
    const status = err.response?.status;

    // Bot-block: escalate immediately, no point retrying with Axios
    if (status && BOT_BLOCK_STATUSES.has(status)) {
      const escalated = new Error(`HTTP ${status} — bot block detected, escalating to browser`);
      escalated.status = status;
      escalated.escalate = true;
      throw escalated;
    }

    // Transient error: retry with backoff
    const isTransient =
      err.code === 'ECONNABORTED' ||
      err.code === 'ECONNRESET' ||
      err.code === 'ETIMEDOUT' ||
      (status && AXIOS_RETRYABLE.has(status));

    if (isTransient && attempt < AXIOS_MAX_RETRIES) {
      const delay = 1500 * (attempt + 1);
      await randomDelay(delay, delay + 500);
      return fetchWithAxios(url, attempt + 1);
    }

    // Escalate flag is already set by the JS-gate check above
    if (err.escalate) throw err;

    // Enrich generic errors with HTTP status
    if (status) {
      const enriched = new Error(`HTTP ${status} — ${err.message}`);
      enriched.status = status;
      throw enriched;
    }

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Core 2 — Puppeteer fetch (with one retry)
// ---------------------------------------------------------------------------

/**
 * Fetches a URL using the Puppeteer browser core.
 * Retries once on transient navigation errors.
 *
 * @param {string} url
 * @param {number} [attempt=0]
 * @returns {Promise<{ html: string, finalUrl: string, core: 'puppeteer' }>}
 */
async function fetchWithPuppeteer(url, attempt = 0) {
  try {
    const { html, finalUrl } = await fetchWithBrowser(url);
    return { html, finalUrl, core: 'puppeteer' };
  } catch (err) {
    const isTransient =
      err.message?.includes('net::ERR_') ||
      err.message?.includes('Navigation timeout') ||
      err.message?.includes('Protocol error');

    if (isTransient && attempt < 1) {
      await randomDelay(2000, 3500);
      return fetchWithPuppeteer(url, attempt + 1);
    }

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public dispatcher — tries Axios, falls back to Puppeteer
// ---------------------------------------------------------------------------

/**
 * Fetches the HTML content of a page, automatically choosing the best core:
 *
 *  - **Axios** is tried first (fast, no browser overhead).
 *  - **Puppeteer** is used when Axios fails with a bot-block status, returns
 *    a JS gate page, or throws a non-retryable error.
 *
 * The returned object includes a `core` field so callers can log which
 * engine was responsible.
 *
 * @param {string} url  Absolute URL to fetch.
 * @returns {Promise<{ html: string, finalUrl: string, core: 'axios' | 'puppeteer' }>}
 * @throws {Error} If both cores fail.
 */
async function fetchPage(url) {
  // --- Attempt 1: Axios core ---
  try {
    const result = await fetchWithAxios(url);
    return result;
  } catch (axiosErr) {
    // Only escalate to browser when warranted
    const shouldEscalate =
      axiosErr.escalate === true ||
      axiosErr.code === 'ENOTFOUND' ||      // DNS failure — also worth trying browser
      axiosErr.code === 'ECONNREFUSED';

    if (!shouldEscalate) throw axiosErr;

    logger.info(
      `↩ Axios failed for ${url} (${axiosErr.message}) — switching to Puppeteer core…`
    );
  }

  // --- Attempt 2: Puppeteer core ---
  try {
    const result = await fetchWithPuppeteer(url);
    return result;
  } catch (puppeteerErr) {
    // Both cores failed — surface a descriptive combined error
    const combined = new Error(
      `Both scraping cores failed for ${url}: ${puppeteerErr.message}`
    );
    combined.status = puppeteerErr.status;
    throw combined;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { fetchPage };
