/**
 * storage.js
 * Persists downloaded HTML to disk, mirroring the URL hierarchy.
 */

const fs = require('fs/promises');
const path = require('path');
const { OUTPUT_DIR } = require('./config');
const { urlToFilePath } = require('./urlUtils');

/**
 * Saves the HTML content of a page to disk.
 *
 * The file is saved as `index.html` inside a directory that mirrors the
 * URL path, rooted under OUTPUT_DIR.
 *
 * Example:
 *   URL  → https://www.extra.com.br/tv/smart-tv-55/
 *   File → crawl/extra.com.br/tv/smart-tv-55/index.html
 *
 * @param {string} url   The canonical URL of the page.
 * @param {string} html  Raw HTML content to save.
 * @returns {Promise<{ filePath: string, size: number }>}
 *          Resolves with the absolute file path and byte size written.
 */
async function savePage(url, html) {
  const relativePath = urlToFilePath(url);
  const dir = path.join(OUTPUT_DIR, relativePath);
  const filePath = path.join(dir, 'index.html');

  // Create directory tree if it doesn't exist yet
  await fs.mkdir(dir, { recursive: true });

  // Write UTF-8 HTML
  const buffer = Buffer.from(html, 'utf8');
  await fs.writeFile(filePath, buffer);

  return { filePath, size: buffer.byteLength };
}

/**
 * Checks whether an index.html file already exists for a given URL.
 * Used to skip re-downloading pages when resuming a crawl.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function pageExists(url) {
  const relativePath = urlToFilePath(url);
  const filePath = path.join(OUTPUT_DIR, relativePath, 'index.html');
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the saved HTML content of a page from disk.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
async function readPage(url) {
  const relativePath = urlToFilePath(url);
  const filePath = path.join(OUTPUT_DIR, relativePath, 'index.html');
  return fs.readFile(filePath, 'utf8');
}

module.exports = { savePage, pageExists, readPage };
