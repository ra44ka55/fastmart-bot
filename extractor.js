const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { ALL_LOCATIONS } = require('./locations');

const STORES_DATABASE = ALL_LOCATIONS;

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    const launchOpts = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--mute-audio',
        '--no-first-run',
        '--disable-extensions',
        '--js-flags=--max-old-space-size=128'
      ]
    };
    try {
      browserInstance = await chromium.launch(launchOpts);
    } catch (err) {
      if (err.message && (err.message.includes("Executable doesn't exist") || err.message.includes('playwright install'))) {
        console.log('[Playwright] Chromium binary missing on host. Auto-installing now...');
        const { execSync } = require('child_process');
        execSync('npx playwright install chromium', { stdio: 'inherit' });
        browserInstance = await chromium.launch(launchOpts);
      } else {
        throw err;
      }
    }
  }
  return browserInstance;
}

/**
 * Fetch basic product details from Instamart page directly
 */
async function getProductDetails(itemId) {
  const url = `https://instamart.in/item/${itemId}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (res.ok) {
      const html = await res.text();
      let name = null;
      let brand = null;
      let price = null;
      let image = null;

      const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (jsonLdMatch) {
        try {
          const data = JSON.parse(jsonLdMatch[1]);
          name = data.name;
          brand = data.brand?.name || null;
          price = data.offers?.price || null;
          image = Array.isArray(data.image) ? data.image[0] : data.image;
        } catch (_) {}
      }

      if (!name) {
        const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["'](.*?)["']/i) ||
                        html.match(/<meta[^>]+content=["'](.*?)["'][^>]+property=["']og:title["']/i);
        if (ogMatch) name = ogMatch[1];
      }

      if (!name) {
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch) name = titleMatch[1];
      }

      if (name) {
        name = name
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/^Buy\s+/i, '')
          .replace(/\s+Online\s+\(1 Unit\)\s+At Best Price/i, '')
          .replace(/\s+Online\s+At Best Price/i, '')
          .trim();

        return {
          name,
          brand,
          price,
          currency: 'INR',
          image
        };
      }
    }
  } catch (err) {
    console.error('[getProductDetails] error:', err.message);
  }
  return null;
}

/**
 * Check stock for a specific store location using browser geolocation context
 * Optimized for minimal overhead & lightning speed
 */
async function checkStoreStock(browser, store, itemId) {
  let context = null;
  let page = null;
  try {
    context = await browser.newContext({
      geolocation: { latitude: store.lat, longitude: store.lon },
      permissions: ['geolocation'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 360, height: 640 }
    });

    // Block all images, styles, fonts, trackers, analytics
    await context.route('**/*', route => {
      const req = route.request();
      const rt = req.resourceType();
      const url = req.url();
      if (['image', 'media', 'font', 'stylesheet'].includes(rt) || 
          url.includes('google-analytics') || 
          url.includes('newrelic') || 
          url.includes('clarity') || 
          url.includes('doubleclick') ||
          url.includes('facebook') ||
          url.includes('telemetry')) {
        return route.abort();
      }
      return route.continue();
    });

    const page = await context.newPage();
    const targetUrl = `https://instamart.in/item/${itemId}`;
    
    // domcontentloaded is 5x faster than networkidle
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 9000 });
    try {
      await page.waitForSelector('button, [role="button"], div, script[type="application/ld+json"]', { timeout: 1000 });
    } catch (_) {}

    const result = await page.evaluate(() => {
      const ld = document.querySelector('script[type="application/ld+json"]');
      let availability = null;
      let price = null;
      if (ld) {
        try {
          const j = JSON.parse(ld.textContent);
          availability = j.offers?.availability;
          price = j.offers?.price;
        } catch (_) {}
      }

      const body = document.body.innerText || '';
      const oosPatterns = [
        'Out of stock',
        'Sold Out',
        'SOLD OUT',
        'Currently unavailable',
        'Currently unserviceable',
        'Coming soon',
        'Not deliverable'
      ];
      const isOOS = oosPatterns.some(pat => body.includes(pat)) || (availability && availability.includes('OutOfStock'));
      
      // Look for active Add button in DOM
      const hasAdd = Array.from(document.querySelectorAll('button, [role="button"], div'))
        .some(b => {
          const t = (b.innerText || '').trim();
          return t === 'ADD' || t === 'Add to cart';
        });

      // Explicit sold out button / badge
      const hasSoldOut = Array.from(document.querySelectorAll('button, [role="button"], div, span'))
        .some(b => {
          const t = (b.innerText || '').trim().toLowerCase();
          return t === 'sold out' || t === 'out of stock';
        });

      let inStock = false;
      if (hasAdd && !hasSoldOut) {
        inStock = true;
      } else if (availability && availability.includes('InStock') && !hasSoldOut) {
        inStock = true;
      }

      return {
        inStock: !!inStock,
        price: price
      };
    });

    return {
      store,
      inStock: result.inStock,
      price: result.price
    };
  } catch (err) {
    return {
      store,
      inStock: false,
      error: err.message
    };
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}

/**
 * Scan all stores with lightweight concurrency pool
 */
async function scanStoresForProduct(itemId, maxStores = null, concurrency = 4, onProgress = () => {}) {
  const browser = await getBrowser();
  const limit = maxStores || STORES_DATABASE.length;
  const storesToScan = STORES_DATABASE.slice(0, limit);
  const foundStores = [];
  let completed = 0;

  for (let i = 0; i < storesToScan.length; i += concurrency) {
    const chunk = storesToScan.slice(i, i + concurrency);
    const promises = chunk.map(store => checkStoreStock(browser, store, itemId));
    const results = await Promise.all(promises);

    for (const res of results) {
      completed++;
      if (res.inStock) {
        foundStores.push(res);
      }
    }
    // Update progress per batch to reduce overhead
    const lastStore = chunk[chunk.length - 1] || {};
    try {
      await onProgress(completed, storesToScan.length, foundStores.length, lastStore);
    } catch (_) {}
  }

  return {
    scanned: completed,
    found: foundStores
  };
}

module.exports = {
  getProductDetails,
  checkStoreStock,
  scanStoresForProduct,
  getBrowser,
  STORES_DATABASE
};
