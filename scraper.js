/**
 * scraper.js – Instamart SKU Locator (Playwright-based)
 *
 * Exports:
 *   lookupSku(lat, lon, sku)                           → { product } or null
 *   lookupSkuAcrossStores(sku, onProgress)             → [ { location, product } ]
 *
 * Env vars (optional):
 *   PROXY_URL   – e.g. http://user:pass@proxy.host:8000  (Indian residential proxy)
 *   MAX_STORES  – max number of stores to scan (default 30)
 */

require('dotenv').config();
const { chromium } = require('playwright');

const { ALL_LOCATIONS } = require('./server');

const PROXY_URL   = process.env.PROXY_URL || null;
const MAX_STORES  = parseInt(process.env.MAX_STORES || '30', 10);
const THROTTLE_MS = 1500;  // delay between store scans

// ── Instamart URL and intercept target ─────────────────────────────────────
const INSTAMART_URL  = 'https://www.swiggy.com/instamart';
const INTERCEPT_PATTERNS = [
  '/dapi/instamart/item/v1',
  '/dapi/instamart/search/v1',
  '/api/instamart/item',
  '/api/instamart/search',
];

/**
 * Checks if a URL looks like an Instamart item/search API call.
 */
function isInstamartApiCall(url) {
  return INTERCEPT_PATTERNS.some(p => url.includes(p));
}

/**
 * Tries to extract matching product from a JSON response.
 * Traverses common Swiggy API nesting structures.
 */
function extractProduct(json, sku) {
  const skuLower = String(sku).toLowerCase().trim();

  // Gather all product arrays from known nested paths
  const candidates = [
    ...(json?.data?.products || []),
    ...(json?.data?.items   || []),
    ...(json?.items         || []),
    ...(json?.products      || []),
    // Swiggy search response structure
    ...(json?.data?.widgets?.flatMap?.(w =>
      w.data?.products || w.data?.items || []
    ) || []),
  ];

  // Match by SKU / product_id / item_id / name keyword
  for (const p of candidates) {
    const ids = [
      String(p.id   || ''),
      String(p.sku  || ''),
      String(p.item_id   || ''),
      String(p.product_id || ''),
    ].map(v => v.toLowerCase());

    const nameMatch = (p.name || '').toLowerCase().includes(skuLower);
    const idMatch   = ids.some(id => id === skuLower || id.includes(skuLower));

    if (idMatch || nameMatch) {
      return p;   // first match wins
    }
  }
  return null;
}

/**
 * lookupSku – open Instamart at the given coords and intercept JSON to find the SKU.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {string} sku  – numeric ID, alphanumeric SKU, or keyword
 * @returns {Promise<object|null>}  product object or null
 */
async function lookupSku(lat, lon, sku) {
  let browser;
  try {
    const launchOpts = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    };
    if (PROXY_URL) launchOpts.proxy = { server: PROXY_URL };

    browser = await chromium.launch(launchOpts);

    const context = await browser.newContext({
      geolocation: { latitude: lat, longitude: lon },
      permissions: ['geolocation'],
      userAgent:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      viewport: { width: 390, height: 844 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      extraHTTPHeaders: {
        'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
      },
    });

    const page = await context.newPage();

    // Mask automation flags
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    let foundProduct = null;

    // Listen for Instamart API responses
    page.on('response', async (response) => {
      if (foundProduct) return;
      const url = response.url();
      if (!isInstamartApiCall(url)) return;

      try {
        const json = await response.json();
        const product = extractProduct(json, sku);
        if (product) {
          foundProduct = product;
        }
      } catch (_) {
        // not JSON or parse error – ignore
      }
    });

    // Navigate to Instamart search
    const searchUrl = `${INSTAMART_URL}/search?query=${encodeURIComponent(sku)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Give a brief extra window for lazy-loaded XHR responses
    await page.waitForTimeout(3000);

    return foundProduct;
  } catch (err) {
    console.error(`[scraper] lookupSku error @ (${lat},${lon}):`, err.message);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * lookupSkuAcrossStores – scans all pre-defined Indian dark-store locations.
 *
 * @param {string}   sku          – SKU / product ID / keyword
 * @param {function} onProgress   – callback(store, matchOrNull, doneCount, totalCount)
 * @returns {Promise<Array<{ location, product }>>}
 */
async function lookupSkuAcrossStores(sku, onProgress = () => {}) {
  const stores  = ALL_LOCATIONS.slice(0, MAX_STORES);
  const matches = [];

  for (let i = 0; i < stores.length; i++) {
    const store   = stores[i];
    const product = await lookupSku(store.lat, store.lon, sku);

    if (product && product.available !== false) {
      matches.push({ location: store, product });
    }

    onProgress(store, product, i + 1, stores.length);

    if (i < stores.length - 1) {
      await new Promise(r => setTimeout(r, THROTTLE_MS));
    }
  }

  return matches;
}

module.exports = { lookupSku, lookupSkuAcrossStores };

// ── CLI helper for quick manual test ─────────────────────────────────────
// node scraper.js "iPhone 16"
if (require.main === module) {
  const sku = process.argv.slice(2).join(' ') || 'iPhone';
  console.log(`🔍 Scanning pan-India for SKU: "${sku}" (up to ${MAX_STORES} stores)…`);

  lookupSkuAcrossStores(sku, (store, match, done, total) => {
    const icon = match ? '🟢' : '🔴';
    console.log(`[${done}/${total}] ${icon} ${store.city} – ${store.name}`);
    if (match) {
      console.log(
        `       ✅ ${match.name} | ₹${match.offer_price || match.mrp} | Qty:${match.inventory ?? 'N/A'}`
      );
    }
  }).then(matches => {
    console.log(`\n✅ Scan complete. Found in ${matches.length} stores.`);
    process.exit(0);
  }).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
