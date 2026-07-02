/**
 * warcWriter.js
 *
 * Appends crawled pages to a .warc file (Web ARChive format, ISO 28500).
 *
 * Each crawl page is appended as a WARC "response" record containing:
 *   - The standard WARC headers (type, URL, ID, date, content length)
 *   - A simulated HTTP/1.1 response header
 *   - The raw HTML payload of the page
 */

'use strict';

const fs = require('fs/promises');
const crypto = require('crypto');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current date in ISO-8601 UTC format.
 * @returns {string} e.g. "2026-06-29T13:30:00Z"
 */
function getWarcDate() {
  return new Date().toISOString();
}

/**
 * Generates a unique record identifier URN.
 * @returns {string} e.g. "<urn:uuid:f81d4fae-7dec-11d0-a765-00a0c91e6bf6>"
 */
function getWarcRecordId() {
  const uuid = crypto.randomUUID();
  return `<urn:uuid:${uuid}>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates the WARC file and writes the initial 'warcinfo' metadata record.
 * If the file already exists, it does nothing (allowing resume).
 *
 * @param {string} warcPath Absolute or relative path to the WARC file.
 * @returns {Promise<void>}
 */
async function initWarcFile(warcPath) {
  const absolutePath = path.resolve(warcPath);

  // Check if file already exists
  try {
    await fs.access(absolutePath);
    return; // Already initialized, do nothing
  } catch {
    // File doesn't exist, proceed to create it with warcinfo
  }

  const date = getWarcDate();
  const recordId = getWarcRecordId();

  // Create the info payload
  const infoPayload = [
    `software: extra-crawler/3.0.0`,
    `format: WARC File Format 1.0`,
    `conformsTo: http://bibnum.bnf.fr/WARC/WARC_ISO_28500_version1_latestdraft.pdf`,
    `description: Web crawl archive of extra.com.br`
  ].join('\r\n') + '\r\n';

  const payloadLength = Buffer.byteLength(infoPayload, 'utf8');

  // Build the warcinfo record
  const record = [
    `WARC/1.0`,
    `WARC-Type: warcinfo`,
    `WARC-Record-ID: ${recordId}`,
    `WARC-Date: ${date}`,
    `Content-Type: application/warcinfo`,
    `Content-Length: ${payloadLength}`,
    ``,
    infoPayload,
    `` // Two trailing blank lines (\r\n\r\n) separate WARC records
  ].join('\r\n');

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, record, 'utf8');
}

/**
 * Appends a crawled page response to the WARC file.
 *
 * @param {string} warcPath Absolute or relative path to the WARC file.
 * @param {string} url      Target URL that was crawled.
 * @param {string} html     HTML content of the page.
 * @returns {Promise<void>}
 */
async function appendWarcRecord(warcPath, url, html) {
  const absolutePath = path.resolve(warcPath);
  const date = getWarcDate();
  const recordId = getWarcRecordId();

  // 1. Build the HTTP response headers representation
  const htmlBuffer = Buffer.from(html, 'utf8');
  const httpHeader = [
    `HTTP/1.1 200 OK`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Length: ${htmlBuffer.length}`,
    `Connection: close`,
    ``,
    ``
  ].join('\r\n');

  const httpHeaderBuffer = Buffer.from(httpHeader, 'utf8');

  // Total payload = HTTP Header + HTML Body
  const totalPayload = Buffer.concat([httpHeaderBuffer, htmlBuffer]);
  const contentLength = totalPayload.length;

  // 2. Build the WARC record header
  const warcHeader = [
    `WARC/1.0`,
    `WARC-Type: response`,
    `WARC-Record-ID: ${recordId}`,
    `WARC-Date: ${date}`,
    `WARC-Target-URI: ${url}`,
    `Content-Type: application/http;msgtype=response`,
    `Content-Length: ${contentLength}`,
    ``,
    ``
  ].join('\r\n');

  const warcHeaderBuffer = Buffer.from(warcHeader, 'utf8');

  // WARC standard specifies records end with exactly \r\n\r\n
  const tailBuffer = Buffer.from('\r\n\r\n', 'utf8');

  const fullRecordBuffer = Buffer.concat([
    warcHeaderBuffer,
    totalPayload,
    tailBuffer
  ]);

  await fs.appendFile(absolutePath, fullRecordBuffer);
}

module.exports = {
  initWarcFile,
  appendWarcRecord
};
