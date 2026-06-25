/**
 * logger.js
 * Coloured console logger using chalk (CommonJS-compatible v4).
 *
 * All output is prefixed with a HH:MM:SS timestamp so you can correlate
 * log lines with network activity in e.g. Wireshark or a proxy tool.
 */

const chalk = require('chalk');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current time formatted as HH:MM:SS.
 * @returns {string}
 */
function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

/**
 * Builds the standard line prefix: a dimmed timestamp.
 * @returns {string}
 */
function prefix() {
  return chalk.grey(timestamp());
}

// ---------------------------------------------------------------------------
// Logger object
// ---------------------------------------------------------------------------

const logger = {
  /**
   * Logs a URL as it enters the crawl queue for processing.
   *
   * @param {string} url
   * @param {number} depth
   */
  visit(url, depth) {
    console.log(
      `${prefix()} ${chalk.green('✔  VISIT')}  [depth ${chalk.bold(depth)}] ${chalk.cyan(url)}`
    );
  },

  /**
   * Logs which scraping core handled a successful fetch.
   * Axios is shown in green (fast path); Puppeteer in yellow (heavy path).
   *
   * @param {string} url
   * @param {'axios' | 'puppeteer'} core
   */
  coreUsed(url, core) {
    const coreLabel =
      core === 'axios'
        ? chalk.green.bold('[axios]')
        : chalk.yellow.bold('[puppeteer🌐]');
    console.log(`${prefix()} ${chalk.grey('   core')}  ${coreLabel} ${chalk.grey(url)}`);
  },

  /**
   * Logs a file saved to disk with its size in KB.
   *
   * @param {string} filePath
   * @param {number} size  Byte count.
   */
  saved(filePath, size) {
    const kb = (size / 1024).toFixed(1);
    console.log(
      `${prefix()} ${chalk.blue('💾  SAVED')}  ${filePath} ${chalk.grey(`(${kb} KB)`)}`
    );
  },

  /**
   * Logs a URL that was skipped and the reason why.
   *
   * @param {string} url
   * @param {string} reason
   */
  skip(url, reason) {
    console.log(
      `${prefix()} ${chalk.yellow('⊘  SKIP ')}  ${chalk.grey(url)} — ${reason}`
    );
  },

  /**
   * Logs a fetch or processing error.
   *
   * @param {string} url
   * @param {string | Error} err
   */
  error(url, err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `${prefix()} ${chalk.red('✖  ERROR')}  ${chalk.red(url)} — ${message}`
    );
  },

  /**
   * Logs a general informational message (startup banners, status updates, etc.).
   *
   * @param {string} message
   */
  info(message) {
    console.log(`${prefix()} ${chalk.magenta('ℹ  INFO ')}  ${message}`);
  },

  /**
   * Prints the final crawl summary table.
   *
   * @param {{
   *   visited: number,
   *   skipped: number,
   *   errors: number,
   *   axisHits?: number,
   *   puppeteerHits?: number,
   *   duration: number
   * }} stats
   */
  summary(stats) {
    const durationSec = (stats.duration / 1000).toFixed(1);
    const axisHits = stats.axiosHits ?? 0;
    const puppeteerHits = stats.puppeteerHits ?? 0;
    const total = axisHits + puppeteerHits;
    const axiosPct = total > 0 ? ((axisHits / total) * 100).toFixed(0) : '—';
    const puppeteerPct = total > 0 ? ((puppeteerHits / total) * 100).toFixed(0) : '—';

    console.log('');
    console.log(chalk.bold('─'.repeat(62)));
    console.log(chalk.bold.white('  Crawl Summary'));
    console.log(chalk.bold('─'.repeat(62)));
    console.log(`  ${chalk.green('Pages visited  :')} ${stats.visited}`);
    console.log(`  ${chalk.yellow('Pages skipped  :')} ${stats.skipped}`);
    console.log(`  ${chalk.red('Errors         :')} ${stats.errors}`);
    console.log(`  ${chalk.cyan('Duration       :')} ${durationSec}s`);
    console.log(chalk.grey('  ── Scraping cores ──────────────────────────'));
    console.log(`  ${chalk.green('Axios (fast)   :')} ${axisHits} pages  (${axiosPct}%)`);
    console.log(`  ${chalk.yellow('Puppeteer (JS) :')} ${puppeteerHits} pages  (${puppeteerPct}%)`);
    console.log(chalk.bold('─'.repeat(62)));
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

module.exports = logger;
