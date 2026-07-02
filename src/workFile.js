/**
 * workFile.js
 *
 * Persists and restores the crawler's work state to/from a .work file (JSON).
 *
 * The .work file allows the crawl to be resumed exactly where it left off
 * after an interruption. It stores:
 *   - queue    : array of { url, depth } items waiting to be crawled
 *   - visited  : set of URLs already enqueued or completed
 *   - stats    : counters accumulated so far
 *   - savedAt  : ISO timestamp of the last save
 *
 * The file is written after every batch so that at most one batch of work
 * is lost on an unclean exit.
 */

'use strict';

const fs   = require('fs/promises');
const path = require('path');
const { WORK_FILE } = require('./config');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Résumé lisible intégré dans le .work
// ---------------------------------------------------------------------------

/**
 * Génère le bloc de texte "Crawl Summary" tel qu'il apparaît dans le log,
 * mais sans couleurs ANSI — pour inclusion dans le .work file.
 *
 * @param {object} stats  Objet stats du crawler.
 * @returns {string}
 */
function formatSummary(stats) {
  const durationSec = ((Date.now() - (stats.startTime ?? Date.now())) / 1000).toFixed(1);
  const sep = '─'.repeat(62);
  return [
    sep,
    '  Crawl Summary',
    sep,
    `  Pages visited    : ${stats.visited    ?? 0}`,
    `  Pages saved      : ${stats.saved      ?? 0}`,
    `  Pages skipped    : ${stats.skipped    ?? 0}`,
    `  Blacklist events : ${stats.blacklisted ?? 0}`,
    `  Blacklist retried: ${stats.retriedOk  ?? 0}`,
    `  Errors           : ${stats.errors     ?? 0}`,
    `  Duration         : ${durationSec}s`,
    sep,
  ].join('\n');
}

const WORK_PATH = path.resolve(WORK_FILE);

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

/**
 * Serialises the current crawler state to the .work file.
 *
 * @param {{ url: string, depth: number }[]} queue   Current BFS queue.
 * @param {Set<string>}                      visited All enqueued/visited URLs.
 * @param {object}                           stats   Crawl statistics object.
 * @returns {Promise<void>}
 */
async function saveWork(queue, visited, stats) {
  const payload = {
    savedAt: new Date().toISOString(),
    summary: formatSummary(stats),
    stats,
    queue,
    visited: [...visited],
  };

  const tmpPath = WORK_PATH + '.tmp';
  try {
    await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    await fs.rename(tmpPath, WORK_PATH);
    logger.workSaved(WORK_PATH, queue.length, visited.size);
  } catch (err) {
    logger.error('workFile', `Failed to write work file atomically: ${err.message}`);
    // Fallback to simple direct write if rename fails
    try {
      await fs.writeFile(WORK_PATH, JSON.stringify(payload, null, 2), 'utf8');
    } catch (e) {
      logger.error('workFile', `Failed simple fallback write: ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Loads the crawler state from the .work file (if it exists).
 *
 * @returns {Promise<{
 *   queue:   { url: string, depth: number }[],
 *   visited: Set<string>,
 *   stats:   object
 * } | null>}  Null if no .work file is found.
 */
async function loadWork() {
  try {
    const raw = await fs.readFile(WORK_PATH, 'utf8');
    if (!raw || !raw.trim()) {
      logger.info('Work file is empty — starting fresh');
      return null;
    }
    const payload = JSON.parse(raw);

    const queue   = payload.queue   ?? [];
    const visited = new Set(payload.visited ?? []);
    const stats   = payload.stats   ?? {};

    logger.workLoaded(WORK_PATH, queue.length, visited.size);
    return { queue, visited, stats };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null; // no work file yet — fresh start
    }
    // Corrupted file — log and start fresh
    logger.error('workFile', `Could not load ${WORK_PATH}: ${err.message} — starting fresh`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Delete (call when crawl completes successfully)
// ---------------------------------------------------------------------------

/**
 * Removes the .work file when the crawl has finished cleanly.
 * Leaves it in place if deletion fails (non-fatal).
 *
 * @returns {Promise<void>}
 */
async function clearWork() {
  try {
    await fs.unlink(WORK_PATH);
    logger.info(`Work file ${WORK_PATH} deleted — crawl complete.`);
  } catch {
    // Already gone or permission error — not fatal
  }
}

module.exports = { saveWork, loadWork, clearWork };
