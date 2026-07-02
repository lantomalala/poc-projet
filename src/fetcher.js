/**
 * fetcher.js
 *
 * Axios-only HTTP fetching layer with intelligent blacklist detection, proxy
 * rotation, and retry.
 *
 * Strategy:
 *  1. Every request is sent through the current proxy (proxyManager).
 *  2. If the server returns a BLACKLIST status (403, 429, 503, 407) or a JS
 *     challenge page is detected:
 *       - The proxy is immediately rotated.
 *       - The error is marked .isBlacklist = true so the caller (crawler.js)
 *         can schedule an exponential-backoff retry with the new proxy.
 *  3. Transient network errors (ECONNABORTED, ECONNRESET, ETIMEDOUT) are
 *     retried internally up to AXIOS_MAX_RETRIES times before giving up.
 */

'use strict';

const axios = require('axios');
const { REQUEST_TIMEOUT, USER_AGENT, DEFAULT_HEADERS } = require('./config');
const proxyManager = require('./proxyManager');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * HTTP status codes that mean "you are being rate-limited or blocked".
 * The crawler will back off and retry these automatically.
 */
const BLACKLIST_STATUSES = new Set([403, 406, 407, 429, 503]);

/**
 * HTTP status codes that are transient server errors worth retrying once.
 */
const TRANSIENT_STATUSES = new Set([500, 502, 504]);

/** Internal Axios retries for transient network/server errors. */
const AXIOS_MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Axios client
// ---------------------------------------------------------------------------

/**
 * Shared Axios instance with sensible, crawler-friendly defaults.
 * The proxy is injected per-request (not here) so that rotation is transparent.
 */
const axiosClient = axios.create({
  timeout: REQUEST_TIMEOUT,
  headers: {
    'User-Agent': USER_AGENT,
    ...DEFAULT_HEADERS,
  },
  decompress: true,
  maxRedirects: 10,
  // Only 2xx treated as success — everything else throws so we can inspect it.
  validateStatus: (status) => status >= 200 && status < 300,
});

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Returns true if the HTML body looks like a JavaScript-only challenge/gate
 * page rather than real content — a common anti-scraping technique.
 *
 * @param {string} html
 * @returns {boolean}
 */
function looksLikeJsGate(html) {
  if (!html || html.length < 300) return true;

  const lower = html.toLowerCase();
  const markers = [
    'challenge-platform',       // Cloudflare
    '__cf_chl',                 // Cloudflare challenge
    'datadome',                 // DataDome
    'px.js',                    // PerimeterX
    '_pxhd',                    // PerimeterX cookie
    'recaptcha',                // reCAPTCHA
    'please enable javascript',
    'you need to enable javascript',
    'this site requires javascript',
    'bot detected',
    'access denied',
  ];

  return markers.some((m) => lower.includes(m));
}

/**
 * Sleeps for ms milliseconds.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Core fetch function
// ---------------------------------------------------------------------------

/**
 * Fetches the HTML content of a URL using Axios through the current proxy.
 *
 * On success, returns `{ html, finalUrl }`.
 *
 * On blacklist (403/429/503/JS-gate), rotates the proxy then throws an error
 * with `err.isBlacklist = true` so the caller can schedule a retry — the next
 * attempt will automatically use the newly rotated proxy.
 *
 * On transient errors, retries internally up to AXIOS_MAX_RETRIES times.
 *
 * @param {string} url       Absolute URL to fetch.
 * @param {number} [attempt] Internal retry counter (0-based).
 * @returns {Promise<{ html: string, finalUrl: string }>}
 * @throws {Error}  err.isBlacklist = true when server is blocking us.
 *                  err.status      = HTTP status code (if applicable).
 */
async function fetchPage(url, attempt = 0) {
  const proxy = proxyManager.getProxy();
  logger.info(`[Proxy] ${proxyManager.currentProxyLabel()} → ${url}`);

  try {
    const response = await axiosClient.get(url, { responseType: 'text', proxy });

    const html     = response.data;
    const finalUrl = response.request?.res?.responseUrl ?? url;

    // Even a 200 OK can hide a JS gate — treat it like a soft block
    if (looksLikeJsGate(html)) {
      proxyManager.rotateProxy('JS gate détecté');
      const err      = new Error('JS gate / empty page detected');
      err.isBlacklist = true;
      err.status      = 200;
      throw err;
    }

    return { html, finalUrl };

  } catch (err) {
    const status = err.response?.status;

    // ── Blacklisted: server is actively blocking us ──────────────────────────
    if (status && BLACKLIST_STATUSES.has(status)) {
      proxyManager.rotateProxy(`HTTP ${status}`);
      const e      = new Error(`HTTP ${status} — blacklisted`);
      e.isBlacklist = true;
      e.status      = status;
      throw e;
    }

    // Propagate a blacklist flag already set (e.g. by the JS-gate check above)
    if (err.isBlacklist) throw err;

    // ── Transient network/server error: retry with back-off ──────────────────
    const isTransient =
      err.code === 'ECONNABORTED'  ||
      err.code === 'ECONNRESET'    ||
      err.code === 'ETIMEDOUT'     ||
      err.code === 'ENOTFOUND'     ||
      (status && TRANSIENT_STATUSES.has(status));

    if (isTransient && attempt < AXIOS_MAX_RETRIES) {
      const delay = 1500 * (attempt + 1);
      logger.info(`Transient error (${err.code ?? status}) for ${url} — retrying in ${delay}ms…`);
      await sleep(delay);
      return fetchPage(url, attempt + 1);
    }

    // ── Permanent error ───────────────────────────────────────────────────────
    if (status) {
      const e  = new Error(`HTTP ${status} — ${err.message}`);
      e.status = status;
      throw e;
    }

    throw err;
  }
}

module.exports = { fetchPage };
