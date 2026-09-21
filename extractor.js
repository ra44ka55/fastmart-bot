const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { ALL_LOCATIONS } = require('./locations');

const STORES_DATABASE = ALL_LOCATIONS; // 239 Core Dark Store Hubs across all 48 cities in India

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
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 4500 });
    // Wait up to 2500ms for dynamic store hydration or status text
    try {
      await page.waitForFunction(() => {
        const text = document.body ? (document.body.innerText || document.body.textContent || '') : '';
        const hasButton = Array.from(document.querySelectorAll('button, [role="button"]')).some(b => {
          const t = (b.innerText || '').trim().toLowerCase();
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          return t === 'add' || t === 'sold out' || t === 'out of stock' || aria === 'add';
        });
        const hasStatusText = /sold\s*out|out\s*of\s*stock|something\s*went\s*wrong|try\s*again/i.test(text);
        return hasButton || hasStatusText;
      }, { timeout: 2200 });
    } catch (_) {}

    const result = await page.evaluate(() => {
      let pageProductName = null;
      const h1 = document.querySelector('h1')?.innerText?.trim();
      const itemSpan = document.querySelector('[class*="item-display-name"], [data-testid*="item"]')?.innerText?.trim();
      if (h1 && h1.length > 3 && !h1.toLowerCase().includes('something went wrong')) {
        pageProductName = h1;
      } else if (itemSpan && itemSpan.length > 3) {
        pageProductName = itemSpan;
      }

      const ld = document.querySelector('script[type="application/ld+json"]');
      let price = null;
      if (ld) {
        try {
          const j = JSON.parse(ld.textContent);
          price = j.offers?.price;
          if (!pageProductName && j.name) pageProductName = j.name;
        } catch (_) {}
      }

      const body = document.body ? (document.body.innerText || document.body.textContent || '') : '';

      // 1. Error / Unserviceable check (Zero false positives)
      const isUnserviceable = /something\s*went\s*wrong|our\s*best\s*minds|try\s*again|currently\s*unserviceable|not\s*deliverable/i.test(body);
      if (isUnserviceable || body.length < 150) {
        return { inStock: false, price, productName: pageProductName };
      }

      // 2. Explicit Out of Stock / Sold Out check (Immediate disqualifier)
      const isSoldOut = /sold\s*out|out\s*of\s*stock|currently\s*unavailable|coming\s*soon/i.test(body);
      if (isSoldOut) {
        return { inStock: false, price, productName: pageProductName };
      }

      // 3. Positive verification of active buy button in DOM
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const hasAdd = buttons.some(b => {
        const t = (b.innerText || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return t === 'add' || t === 'add to cart' || aria === 'add';
      });

      // 4. Fallback price extraction from body if ld is missing
      if (!price) {
        const priceMatch = body.match(/₹\s*([\d,]+)/);
        if (priceMatch) {
          price = priceMatch[1].replace(/,/g, '');
        }
      }

      // 5. In-Stock is strictly TRUE ONLY IF: active ADD button + product identified + zero OOS markers
      const inStock = hasAdd && !isSoldOut && !isUnserviceable && !!pageProductName;

      return {
        inStock: !!inStock,
        price: price,
        productName: pageProductName
      };
    });

    return {
      store,
      inStock: result.inStock,
      price: result.price,
      productName: result.productName
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
async function scanStoresForProduct(itemId, maxStores = null, concurrency = 8, onProgress = () => {}) {
  const browser = await getBrowser();
  const limit = maxStores || STORES_DATABASE.length;
  const storesToScan = STORES_DATABASE.slice(0, limit);
  const foundStores = [];
  let completed = 0;
  let capturedProductName = null;

  for (let i = 0; i < storesToScan.length; i += concurrency) {
    const chunk = storesToScan.slice(i, i + concurrency);
    const promises = chunk.map(store => checkStoreStock(browser, store, itemId));
    const results = await Promise.all(promises);

    for (const res of results) {
      completed++;
      if (res.productName && !capturedProductName) {
        capturedProductName = res.productName;
      }
      if (res.inStock) {
        foundStores.push(res);
      }
    }
    // Update progress per batch to reduce overhead
    const lastStore = chunk[chunk.length - 1] || {};
    try {
      await onProgress(completed, storesToScan.length, foundStores.length, lastStore, capturedProductName);
    } catch (_) {}
  }

  return {
    scanned: completed,
    found: foundStores,
    productName: capturedProductName
  };
}

module.exports = {
  getProductDetails,
  checkStoreStock,
  scanStoresForProduct,
  getBrowser,
  STORES_DATABASE
};
