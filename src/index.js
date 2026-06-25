/**
 * index.js
 * Entry point — bootstraps the crawler and prints a summary when done.
 */

const { runCrawl, stats } = require('./crawler');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Graceful shutdown on CTRL+C
// ---------------------------------------------------------------------------
process.on('SIGINT', () => {
  logger.info('Interrupt received — printing summary and exiting…');
  printSummary();
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printSummary() {
  stats.duration = Date.now() - stats.startTime;
  logger.summary(stats);
}

(async () => {
  try {
    await runCrawl();
    printSummary();
  } catch (err) {
    logger.error('Fatal error in crawler', err);
    printSummary();
    process.exit(1);
  }
})();
