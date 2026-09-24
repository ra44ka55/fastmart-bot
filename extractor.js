const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
let STORES_DATABASE = [];
try {
  STORES_DATABASE = JSON.parse(fs.readFileSync(path.join(__dirname, 'all_stores_indexed.json'), 'utf8'));
} catch (_) {
  const { ALL_LOCATIONS } = require('./locations');
  STORES_DATABASE = ALL_LOCATIONS;
}

let browserInstance = null;

async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (_) {}
    browserInstance = null;
  }
}

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
        '--renderer-process-limit=4',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-sync',
        '--js-flags=--max-old-space-size=96'
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

    // CRITICAL: Inject real Swiggy Instamart userLocation cookie to force live dark store inventory
    await context.addCookies([
      {
        name: 'userLocation',
        value: encodeURIComponent(JSON.stringify({
          lat: store.lat,
          lng: store.lon,
          address: `${store.name}, ${store.city}`
        })),
        domain: '.instamart.in',
        path: '/'
      }
    ]);

    // Block heavy static assets (images, fonts, stylesheets)
    await context.route('**/*', route => {
      const rt = route.request().resourceType();
      const url = route.request().url();
      if (['image', 'media', 'font', 'stylesheet'].includes(rt) || 
          url.includes('google-analytics') || url.includes('newrelic') || url.includes('clarity')) {
        return route.abort();
      }
      return route.continue();
    });

    page = await context.newPage();
    const targetUrl = `https://instamart.in/item/${itemId}`;
    
    // waitUntil 'commit' returns instantly (<1s) without hanging on slow assets
    await page.goto(targetUrl, { waitUntil: 'commit', timeout: 8000 });
    
    // Wait up to 3500ms for dynamic store hydration or status text
    try {
      await page.waitForFunction(() => {
        const hasH1 = !!document.querySelector('h1');
        const hasBtn = Array.from(document.querySelectorAll('button, [role="button"]')).some(b => {
          const t = (b.innerText || '').trim().toLowerCase();
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          return t === 'add' || t === 'add to cart' || aria === 'add' || t === 'sold out' || t === 'out of stock';
        });
        const bodyText = document.body ? document.body.innerText : '';
        const isErrText = /something\s*went\s*wrong|sold\s*out|out\s*of\s*stock|currently\s*unavailable|currently\s*unserviceable/i.test(bodyText);
        return (hasH1 && hasBtn) || isErrText;
      }, { timeout: 3500 });
    } catch (_) {}

    const result = await page.evaluate(() => {
      const cleanBody = document.body ? document.body.innerText : '';

      // 1. If device is unserviceable / not listed in this dark store:
      const isSomethingWrong = /something\s*went\s*wrong|our\s*best\s*minds|currently\s*unserviceable|not\s*deliverable/i.test(cleanBody);
      if (isSomethingWrong) {
        return { inStock: false, price: null, productName: null };
      }

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

      // 2. Positive verification of active visible buy button in DOM
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], [class*="add-button"], [data-testid*="add-to-cart"]'));
      const hasAdd = buttons.some(b => {
        const isVis = (b.offsetWidth > 0 || b.offsetHeight > 0 || b.getClientRects().length > 0);
        const t = (b.innerText || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return isVis && (t === 'add' || t === 'add to cart' || aria === 'add' || aria.includes('add to cart'));
      });

      // 3. Explicit Out of Stock / Sold Out button check
      const hasSoldOutButton = buttons.some(b => {
        const isVis = (b.offsetWidth > 0 || b.offsetHeight > 0 || b.getClientRects().length > 0);
        const t = (b.innerText || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return isVis && (t === 'sold out' || t === 'out of stock' || aria.includes('sold out'));
      });

      // 4. Text checks
      const isSoldOutText = /sold\s*out|out\s*of\s*stock|currently\s*unavailable|coming\s*soon/i.test(cleanBody);

      // 5. Fallback price extraction from clean body if ld is missing
      if (!price && cleanBody) {
        const priceMatch = cleanBody.match(/₹\s*([\d,]+)/);
        if (priceMatch) {
          price = priceMatch[1].replace(/,/g, '');
        }
      }

      // 6. In-Stock is strictly TRUE ONLY IF: active ADD button + zero OOS/error markers
      const inStock = hasAdd && !hasSoldOutButton && !isSoldOutText && !isSomethingWrong && !!pageProductName;

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
 * Scan all stores with high-throughput sliding worker pool
 * Eliminates idle waiting barriers between batches
 */
async function scanStoresForProduct(itemId, maxStoresOrList = null, concurrency = 4, onProgress = () => {}) {
  const browser = await getBrowser();
  let storesToScan = [];
  if (Array.isArray(maxStoresOrList)) {
    storesToScan = maxStoresOrList;
  } else {
    const limit = maxStoresOrList || STORES_DATABASE.length;
    storesToScan = STORES_DATABASE.slice(0, limit);
  }
  const foundStores = [];
  let completed = 0;
  let capturedProductName = null;
  let storeIndex = 0;

  const workers = Array(Math.min(concurrency, storesToScan.length)).fill(0).map(async () => {
    while (storeIndex < storesToScan.length) {
      const idx = storeIndex++;
      const store = storesToScan[idx];
      const res = await checkStoreStock(browser, store, itemId);
      
      completed++;
      if (res.productName && !capturedProductName) {
        capturedProductName = res.productName;
      }
      if (res.inStock) {
        foundStores.push(res);
      }

      try {
        await onProgress(completed, storesToScan.length, foundStores.length, store, capturedProductName, res);
      } catch (_) {}
    }
  });

  try {
    await Promise.all(workers);
  } finally {
    await closeBrowser();
  }

  return {
    scanned: completed,
    found: foundStores,
    productName: capturedProductName
  };
}

/**
 * Fast restock checker for background alert watcher.
 * Checks key hubs or specific city for a given itemId.
 * Re-uses browser, closes cleanly in finally.
 */
async function checkItemRestock(itemId, targetCity = null) {
  const browser = await getBrowser();
  let storesToCheck = [];
  
  if (targetCity && targetCity !== 'All India Dark Stores' && targetCity !== 'All India') {
    storesToCheck = STORES_DATABASE.filter(s => 
      (s.city || '').toLowerCase() === targetCity.toLowerCase() ||
      (s.state || '').toLowerCase() === targetCity.toLowerCase()
    );
  }
  
  if (!storesToCheck.length) {
    const majorHubs = ['Bengaluru', 'Delhi', 'Mumbai', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata', 'Gurugram', 'Noida', 'Ahmedabad'];
    for (const city of majorHubs) {
      const match = STORES_DATABASE.find(s => (s.city || '').toLowerCase() === city.toLowerCase());
      if (match && !storesToCheck.some(st => st.name === match.name)) {
        storesToCheck.push(match);
      }
    }
  }
  
  if (!storesToCheck.length) storesToCheck = STORES_DATABASE.slice(0, 8);

  try {
    for (const store of storesToCheck) {
      const res = await checkStoreStock(browser, store, itemId);
      if (res && res.inStock) {
        return { inStock: true, store, price: res.price, productName: res.productName };
      }
    }
    return { inStock: false };
  } catch (err) {
    console.error(`[checkItemRestock] Error checking ${itemId}:`, err.message);
    return { inStock: false, error: err.message };
  } finally {
    await closeBrowser();
  }
}

module.exports = {
  getProductDetails,
  checkStoreStock,
  scanStoresForProduct,
  checkItemRestock,
  getBrowser,
  closeBrowser,
  STORES_DATABASE
};
