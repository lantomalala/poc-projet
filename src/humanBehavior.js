/**
 * humanBehavior.js
 *
 * A collection of helpers that make Puppeteer act more like a real human
 * browsing the web — random pauses, natural mouse movements, progressive
 * scrolling, and realistic viewport / interaction patterns.
 *
 * None of these are strictly required for scraping, but they dramatically
 * reduce the chance of getting flagged by anti-bot systems.
 */

// ---------------------------------------------------------------------------
// Basic timing utilities
// ---------------------------------------------------------------------------

/**
 * Returns a random integer between min and max (inclusive).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleeps for a random number of milliseconds within [min, max].
 * @param {number} min  Lower bound in ms.
 * @param {number} max  Upper bound in ms.
 * @returns {Promise<void>}
 */
function randomDelay(min = 300, max = 1200) {
  return new Promise((resolve) => setTimeout(resolve, randInt(min, max)));
}

/**
 * Sleeps for a fixed number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Mouse movement simulation
// ---------------------------------------------------------------------------

/**
 * Moves the mouse from its current position to (x, y) in small incremental
 * steps, mimicking the way a human moves a cursor across the screen.
 *
 * @param {import('puppeteer').Page} page
 * @param {number} x  Target X coordinate.
 * @param {number} y  Target Y coordinate.
 * @param {number} [steps=20]  Number of intermediate positions.
 */
async function humanMouseMove(page, x, y, steps = 20) {
  // Generate a smooth curved path using simple lerp with slight jitter
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const jitterX = randInt(-3, 3);
    const jitterY = randInt(-3, 3);
    await page.mouse.move(
      Math.round(x * progress + jitterX),
      Math.round(y * progress + jitterY)
    );
    // Tiny pause between each micro-movement
    await sleep(randInt(5, 20));
  }
}

/**
 * Moves the mouse to a random position within the viewport — useful for
 * breaking up suspiciously static cursor positions.
 *
 * @param {import('puppeteer').Page} page
 */
async function randomMouseWander(page) {
  const viewport = page.viewport();
  if (!viewport) return;

  const x = randInt(50, viewport.width - 50);
  const y = randInt(50, viewport.height - 50);
  await humanMouseMove(page, x, y, randInt(10, 25));
}

// ---------------------------------------------------------------------------
// Scrolling simulation
// ---------------------------------------------------------------------------

/**
 * Scrolls the page progressively from top to bottom in small, irregular
 * increments — simulating how a human reads a page before clicking a link.
 *
 * @param {import('puppeteer').Page} page
 * @param {object} [options]
 * @param {number} [options.maxScrolls=8]   Maximum number of scroll steps.
 * @param {number} [options.pixelMin=80]    Min pixels scrolled per step.
 * @param {number} [options.pixelMax=300]   Max pixels scrolled per step.
 * @param {number} [options.pauseMin=200]   Min pause between scrolls (ms).
 * @param {number} [options.pauseMax=700]   Max pause between scrolls (ms).
 */
async function naturalScroll(page, {
  maxScrolls = 8,
  pixelMin = 80,
  pixelMax = 300,
  pauseMin = 200,
  pauseMax = 700,
} = {}) {
  const scrollCount = randInt(2, maxScrolls);

  for (let i = 0; i < scrollCount; i++) {
    const pixels = randInt(pixelMin, pixelMax);
    await page.evaluate((px) => window.scrollBy(0, px), pixels);
    await randomDelay(pauseMin, pauseMax);
  }

  // Occasionally scroll back up slightly — real users do this
  if (Math.random() < 0.3) {
    await page.evaluate((px) => window.scrollBy(0, -px), randInt(50, 150));
    await randomDelay(150, 400);
  }
}

// ---------------------------------------------------------------------------
// Typing simulation
// ---------------------------------------------------------------------------

/**
 * Types a string character-by-character with human-like timing variation.
 * Useful when a page requires a search field or form interaction.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} selector  CSS selector for the input field.
 * @param {string} text      Text to type.
 */
async function humanType(page, selector, text) {
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: randInt(50, 180) });
  }
}

// ---------------------------------------------------------------------------
// Page-ready helpers
// ---------------------------------------------------------------------------

/**
 * Waits for the page to be fully network-idle (no pending requests for 500ms)
 * with a generous timeout so we don't bail too early on slow sites.
 *
 * @param {import('puppeteer').Page} page
 * @param {number} [timeoutMs=12000]
 */
async function waitForIdle(page, timeoutMs = 12_000) {
  try {
    await page.waitForNetworkIdle({ timeout: timeoutMs, idleTime: 500 });
  } catch {
    // Timeout is acceptable — some pages never fully quiesce
  }
}

/**
 * Dismisses common cookie / GDPR consent dialogs that might obscure content.
 * Tries a handful of popular button patterns; silently skips if none found.
 *
 * @param {import('puppeteer').Page} page
 */
async function dismissCookieBanners(page) {
  const consentSelectors = [
    // Generic accept buttons
    'button[id*="accept"]',
    'button[class*="accept"]',
    'button[id*="consent"]',
    'button[class*="consent"]',
    // Common Portuguese / Brazilian patterns
    'button[id*="aceitar"]',
    'button[class*="aceitar"]',
    'a[id*="aceitar"]',
    // Generic close patterns
    '[aria-label*="Accept"]',
    '[aria-label*="Aceitar"]',
  ];

  for (const sel of consentSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        await randomDelay(300, 800);
        break; // One dismiss is enough
      }
    } catch {
      // Selector not found or not clickable — move on
    }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  randInt,
  randomDelay,
  sleep,
  humanMouseMove,
  randomMouseWander,
  naturalScroll,
  humanType,
  waitForIdle,
  dismissCookieBanners,
};
