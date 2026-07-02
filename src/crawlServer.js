/**
 * crawlServer.js
 * Lancer le crawler avec une URL personnalisée depuis l'interface.
 */

'use strict';

// Charger la config avant d'importer les modules
const config = require('./config');
const crawlUrl = process.env.CRAWL_URL || config.START_URL;

// Surcharger la config avec l'URL fournie
Object.defineProperty(config, 'START_URL', {
  value: crawlUrl,
  writable: false
});

const { runCrawl, getStats } = require('./crawler');
const logger = require('./logger');

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Interrupt received — printing summary and exiting…');
  printSummary();
  logger.close();
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});

function printSummary() {
  const stats = getStats();
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
  } finally {
    logger.close();
  }
})();
