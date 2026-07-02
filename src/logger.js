/**
 * logger.js
 *
 * Dual-output logger: coloured console + append-to-file log.
 *
 * Every event is written to both:
 *   - The terminal   (with ANSI colours via chalk)
 *   - crawl.log      (plain text, no colour codes)
 *
 * Log file format (one event per line):
 *   [HH:MM:SS] TYPE  message
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const chalk = require('chalk');

// Resolve LOG_FILE from config (avoid circular if config requires logger)
let _logFile = null;
function getLogStream() {
  if (_logFile) return _logFile;
  try {
    const { LOG_FILE } = require('./config');
    _logFile = fs.createWriteStream(path.resolve(LOG_FILE), { flags: 'a' });
  } catch {
    // fallback if config not ready
    _logFile = fs.createWriteStream(path.resolve('crawl.log'), { flags: 'a' });
  }
  return _logFile;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

/**
 * Strips ANSI escape codes from a string (for log file output).
 * @param {string} str
 * @returns {string}
 */
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

/**
 * Write a line to the log file (no colours) and to the console (with colours).
 *
 * @param {string} type   Short type label e.g. 'VISIT', 'SAVED', 'SKIP', etc.
 * @param {string} msg    Coloured message for console.
 * @param {'log'|'error'} [stream='log']
 */
function emit(type, msg, stream = 'log') {
  const ts = timestamp();
  const consoleLine = `${chalk.grey(ts)} ${msg}`;
  const fileLine    = `[${ts}] ${type.padEnd(8)} ${stripAnsi(msg)}\n`;

  if (stream === 'error') {
    console.error(consoleLine);
  } else {
    console.log(consoleLine);
  }

  try {
    getLogStream().write(fileLine);
  } catch { /* ignore file errors */ }
}

// ---------------------------------------------------------------------------
// Logger object
// ---------------------------------------------------------------------------

const logger = {
  /**
   * Logs a URL as it enters the crawl queue for processing.
   */
  visit(url, depth) {
    emit('VISIT',
      `${chalk.green('✔  VISIT')}  [depth ${chalk.bold(depth)}] ${chalk.cyan(url)}`
    );
  },

  /**
   * Logs which scraping core handled a successful fetch.
   */
  coreUsed(url, core) {
    const label = core === 'axios'
      ? chalk.green.bold('[axios]')
      : chalk.yellow.bold('[retry]');
    emit('CORE', `${chalk.grey('   core')}  ${label} ${chalk.grey(url)}`);
  },

  /**
   * Logs a file saved to disk with its size in KB.
   */
  saved(filePath, size) {
    const kb = (size / 1024).toFixed(1);
    emit('SAVED',
      `${chalk.blue('💾  SAVED')}  ${filePath} ${chalk.grey(`(${kb} KB)`)}`
    );
  },

  /**
   * Logs a URL that was skipped and the reason why.
   */
  skip(url, reason) {
    emit('SKIP',
      `${chalk.yellow('⊘  SKIP ')}  ${chalk.grey(url)} — ${reason}`
    );
  },

  /**
   * Logs a blacklist event — the server blocked us.
   */
  blacklisted(url, status, attempt, maxRetries) {
    emit('BLACKLIST',
      `${chalk.red.bold('🚫 BLACKLIST')} HTTP ${status} — ${chalk.red(url)} ` +
      chalk.grey(`(retry ${attempt}/${maxRetries})`)
    );
  },

  /**
   * Logs a successful retry after a blacklist.
   */
  retryOk(url, attempt) {
    emit('RETRY_OK',
      `${chalk.green('♻  RETRY OK')} attempt ${attempt} succeeded — ${chalk.cyan(url)}`
    );
  },

  /**
   * Logs a fetch or processing error.
   */
  error(url, err) {
    const message = err instanceof Error ? err.message : String(err);
    emit('ERROR',
      `${chalk.red('✖  ERROR')}  ${chalk.red(url)} — ${message}`,
      'error'
    );
  },

  /**
   * Logs a general informational message.
   */
  info(message) {
    emit('INFO', `${chalk.magenta('ℹ  INFO ')}  ${message}`);
  },

  /**
   * Logs a work-file persistence event.
   */
  workSaved(filePath, queueSize, visitedSize) {
    emit('WORK',
      `${chalk.cyan('💼  WORK  ')}  Saved → ${filePath} ` +
      chalk.grey(`(queue: ${queueSize} | visited: ${visitedSize})`)
    );
  },

  /**
   * Logs a work-file load event.
   */
  workLoaded(filePath, queueSize, visitedSize) {
    emit('WORK',
      `${chalk.cyan('💼  WORK  ')}  Loaded ← ${filePath} ` +
      chalk.grey(`(queue: ${queueSize} | visited: ${visitedSize})`)
    );
  },

  /**
   * Prints the final crawl summary to console AND log file.
   */
  summary(stats) {
    const durationSec = (stats.duration / 1000).toFixed(1);
    const lines = [
      '',
      '─'.repeat(62),
      '  Crawl Summary',
      '─'.repeat(62),
      `  Pages visited    : ${stats.visited}`,
      `  Pages saved      : ${stats.saved}`,
      `  Pages skipped    : ${stats.skipped}`,
      `  Blacklist events : ${stats.blacklisted}`,
      `  Blacklist retried: ${stats.retriedOk}`,
      `  Errors           : ${stats.errors}`,
      `  Duration         : ${durationSec}s`,
      '─'.repeat(62),
    ];

    console.log('');
    console.log(chalk.bold(lines[1]));
    console.log(chalk.bold.white(lines[2]));
    console.log(chalk.bold(lines[3]));
    console.log(`  ${chalk.green('Pages visited    :')} ${stats.visited}`);
    console.log(`  ${chalk.blue('Pages saved      :')} ${stats.saved}`);
    console.log(`  ${chalk.yellow('Pages skipped    :')} ${stats.skipped}`);
    console.log(`  ${chalk.red('Blacklist events :')} ${stats.blacklisted}`);
    console.log(`  ${chalk.green('Blacklist retried:')} ${stats.retriedOk}`);
    console.log(`  ${chalk.red('Errors           :')} ${stats.errors}`);
    console.log(`  ${chalk.cyan('Duration         :')} ${durationSec}s`);
    console.log(chalk.bold(lines[lines.length - 1]));

    // Also write summary to log file
    try {
      const ts = timestamp();
      getLogStream().write(lines.join('\n') + '\n');
    } catch { /* ignore */ }
  },

  /**
   * Ferme proprement le stream du log en attendant que toutes les écritures
   * en attente soient flushées (évite la troncature du résumé final).
   *
   * @returns {Promise<void>}
   */
  close() {
    return new Promise((resolve) => {
      if (!_logFile) return resolve();
      const stream = _logFile;
      _logFile = null;
      stream.end(() => resolve());
    });
  },
};

module.exports = logger;
