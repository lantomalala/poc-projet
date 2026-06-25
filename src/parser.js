/**
 * parser.js
 * Extracts internal links from an HTML document using Cheerio.
 */

const cheerio = require('cheerio');
const { resolveUrl } = require('./urlUtils');

/**
 * Parses the HTML of a page and returns all unique internal links found.
 *
 * It looks for `href` attributes in:
 *  - <a> tags
 *  - <link rel="canonical"> tags (canonical URL discovery)
 *
 * @param {string} html        Raw HTML string.
 * @param {string} baseUrl     URL of the page (used to resolve relative links).
 * @returns {string[]}         Array of unique, normalised, internal absolute URLs.
 */
function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const links = [];

  // Selectors that can carry navigable URLs
  const selectors = [
    'a[href]',
    'link[rel="canonical"][href]',
  ];

  $(selectors.join(', ')).each((_i, el) => {
    const raw = $(el).attr('href');
    const resolved = resolveUrl(raw, baseUrl);

    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      links.push(resolved);
    }
  });

  return links;
}

module.exports = { extractLinks };
