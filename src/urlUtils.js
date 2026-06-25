/**
 * urlUtils.js
 * Helper functions for URL normalisation and validation.
 */

const { URL } = require('url');
const { TARGET_DOMAIN } = require('./config');

/**
 * List of URL schemes that should always be ignored.
 */
const IGNORED_SCHEMES = new Set(['mailto:', 'javascript:', 'tel:', 'ftp:', 'data:']);

/**
 * Resolves a potentially relative href against a base URL and returns
 * a fully-qualified, normalised URL string, or null if the link should
 * be ignored.
 *
 * Rules:
 *  - Must be http or https.
 *  - Must belong to TARGET_DOMAIN (or a subdomain thereof).
 *  - Fragments (#…) are stripped.
 *  - Query strings are preserved (product variants often live behind query params).
 *  - Trailing slashes are normalised to a single slash for root paths.
 *
 * @param {string} href   The raw href attribute value.
 * @param {string} base   The URL of the page that contains this link.
 * @returns {string|null} Normalised absolute URL or null.
 */
function resolveUrl(href, base) {
  if (!href || typeof href !== 'string') return null;

  const trimmed = href.trim();
  if (!trimmed) return null;

  // Reject well-known non-HTTP schemes early (before URL parsing)
  for (const scheme of IGNORED_SCHEMES) {
    if (trimmed.toLowerCase().startsWith(scheme)) return null;
  }

  let parsed;
  try {
    parsed = new URL(trimmed, base);
  } catch {
    return null;
  }

  // Keep only http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  // Must be within the target domain (allows subdomains)
  if (!isInternalUrl(parsed)) return null;

  // Strip fragment — we want the page content, not a specific anchor
  parsed.hash = '';

  return parsed.href;
}

/**
 * Returns true if the given parsed URL belongs to TARGET_DOMAIN or any
 * subdomain of it.
 *
 * @param {URL} parsed
 * @returns {boolean}
 */
function isInternalUrl(parsed) {
  const host = parsed.hostname;
  return host === TARGET_DOMAIN || host.endsWith(`.${TARGET_DOMAIN}`);
}

/**
 * Converts a URL into a filesystem-friendly relative path that mirrors
 * the site's directory hierarchy.
 *
 * Examples:
 *   https://www.extra.com.br/           → extra.com.br/
 *   https://www.extra.com.br/eletronics → extra.com.br/eletronics/
 *   https://www.extra.com.br/tv/4k      → extra.com.br/tv/4k/
 *
 * @param {string} urlString  Absolute URL.
 * @returns {string}          Relative directory path (always ends with '/').
 */
function urlToFilePath(urlString) {
  const parsed = new URL(urlString);

  // Use the bare domain (without www/subdomain prefix) as the root folder.
  // e.g. www.extra.com.br → extra.com.br
  const domain = parsed.hostname.replace(/^www\./, '');

  // Decode percent-encoded characters for readable folder names
  let pathname = decodeURIComponent(parsed.pathname);

  // Sanitise: remove characters unsafe on common filesystems
  pathname = pathname.replace(/[<>:"|?*\\]/g, '_');

  // Ensure the path ends with a slash so we always write index.html inside a folder
  if (!pathname.endsWith('/')) {
    pathname += '/';
  }

  // If there are query parameters, encode them as part of the folder name
  // to avoid collisions between e.g. /produto?cor=azul and /produto?cor=vermelho
  let querySegment = '';
  if (parsed.search) {
    // Remove leading '?' and replace special chars
    querySegment = parsed.search.slice(1).replace(/[&=]/g, '_').replace(/[<>:"|?*\\]/g, '_') + '/';
  }

  // Combine: domain + pathname + optional query segment
  return `${domain}${pathname}${querySegment}`;
}

module.exports = { resolveUrl, urlToFilePath, isInternalUrl };
