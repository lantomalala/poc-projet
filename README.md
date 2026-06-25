# Extra.com.br Crawler

A clean, modular Node.js web crawler built with **Axios** and **Cheerio** that mirrors the `extra.com.br` website structure to disk.

## Features

- ✅ Downloads HTML pages via Axios (with automatic retry on transient errors)
- ✅ Saves pages in a directory tree that mirrors the site's URL hierarchy
- ✅ Extracts internal links using Cheerio
- ✅ Deduplication — each URL is visited only once
- ✅ Configurable concurrency (default: 5 simultaneous requests)
- ✅ Polite inter-batch delay
- ✅ Configurable max depth and max page limits
- ✅ Coloured, timestamped console logs
- ✅ Graceful shutdown on CTRL+C (prints summary)
- ✅ Ignores: external links, `#` anchors, `mailto:`, `javascript:`, `tel:`

---

## Project Structure

```
.
├── package.json
├── README.md
└── src/
    ├── index.js       ← Entry point
    ├── config.js      ← All tuneable parameters
    ├── crawler.js     ← BFS crawl engine (queue + concurrency)
    ├── fetcher.js     ← Axios HTTP client with retry logic
    ├── parser.js      ← Cheerio-based link extractor
    ├── storage.js     ← Saves HTML to disk (URL → folder mapping)
    ├── urlUtils.js    ← URL resolution, validation, path conversion
    └── logger.js      ← Coloured console logger
```

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run the crawler

```bash
npm start
```

The crawler will begin at `https://www.extra.com.br/` and save pages under:

```
crawl/
└── extra.com.br/
    ├── index.html
    ├── eletronicos/
    │   ├── index.html
    │   └── televisores/
    │       ├── index.html
    │       └── smart-tv-55-polegadas/
    │           └── index.html
    └── ...
```

---

## Configuration

All settings live in [`src/config.js`](src/config.js):

| Key | Default | Description |
|-----|---------|-------------|
| `START_URL` | `https://www.extra.com.br/` | Entry point |
| `TARGET_DOMAIN` | `extra.com.br` | Only URLs on this domain (and subdomains) are followed |
| `OUTPUT_DIR` | `crawl` | Root folder for saved pages |
| `CONCURRENCY` | `5` | Max simultaneous HTTP requests |
| `REQUEST_TIMEOUT` | `15000` | Per-request timeout (ms) |
| `BATCH_DELAY` | `500` | Delay between batches of requests (ms) |
| `MAX_DEPTH` | `0` | Max crawl depth (`0` = unlimited) |
| `MAX_PAGES` | `0` | Max pages to crawl (`0` = unlimited) |

### Quick example — limit to 100 pages and 3 levels deep:

```js
// src/config.js
MAX_DEPTH: 3,
MAX_PAGES: 100,
```

---

## Log Format

```
10:15:32 ✔  VISIT  [depth 0] https://www.extra.com.br/
10:15:33 💾  SAVED  crawl/extra.com.br/index.html (42.3 KB)
10:15:33 ✔  VISIT  [depth 1] https://www.extra.com.br/eletronicos/
10:15:34 💾  SAVED  crawl/extra.com.br/eletronicos/index.html (89.1 KB)
10:15:35 ⊘  SKIP   https://careers.extra.com.br/ — external domain
10:15:36 ✖  ERROR  https://www.extra.com.br/broken — HTTP 404 — Not Found
```

---

## Notes

- The crawler is **breadth-first**: it explores the site level by level.
- Pages are **not re-fetched** if the file already exists on disk — you can safely stop and resume a crawl.
- Large sites like `extra.com.br` contain thousands of products. Use `MAX_PAGES` or `MAX_DEPTH` to limit the scope during testing.
- The `User-Agent` header is set to identify the crawler. Respect the site's `robots.txt` and terms of service.
