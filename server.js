const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let DEFAULT_API_KEY = process.env.QC_API_KEY || '0390d3cd-c5ef-4514-92eb-caf81baac567';
let lastCreditsRemaining = 93;

// Cache map: key -> { data, expiresAt }
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Tracked items for Watchlist
let watchlist = [];
const WATCHLIST_FILE = path.join(__dirname, 'watchlist.json');
if (fs.existsSync(WATCHLIST_FILE)) {
  try {
    watchlist = JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf8'));
  } catch (e) {
    watchlist = [];
  }
}

function saveWatchlist() {
  try {
    fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(watchlist, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save watchlist:', e);
  }
}

// 250+ Dark Store Locations across 40+ Cities in India
// Loaded from locations.js
const { ALL_LOCATIONS } = require('./locations');
module.exports = { ALL_LOCATIONS };

app.get('/api/locations', (req, res) => {
  res.json({ locations: ALL_LOCATIONS, total: ALL_LOCATIONS.length });
});

// Geocoding / Pincode Resolver (allows searching ANY area or 6-digit pin in India)
app.get('/api/geocode', async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q) return res.status(400).json({ error: 'Query "q" is required' });

    // Check if match in our 112 locations first
    const localMatches = ALL_LOCATIONS.filter(loc => 
      loc.name.toLowerCase().includes(q.toLowerCase()) || 
      loc.city.toLowerCase().includes(q.toLowerCase())
    );

    if (localMatches.length > 0) {
      return res.json({ source: 'local', results: localMatches });
    }

    // Otherwise lookup via Nominatim OpenStreetMap (Indian bounds)
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=in&format=json&limit=5`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'QuickCommerceStockTracker/1.0' }
    });
    const data = await response.json();
    const mapped = (data || []).map(item => ({
      name: item.display_name.split(',').slice(0, 3).join(','),
      city: item.address?.city || item.address?.state_district || 'India',
      lat: parseFloat(parseFloat(item.lat).toFixed(4)),
      lon: parseFloat(parseFloat(item.lon).toFixed(4))
    }));

    res.json({ source: 'nominatim', results: mapped });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Single Location Search Proxy
app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const platform = req.query.platform || 'Swiggy';
    const lat = req.query.lat || '12.90';
    const lon = req.query.lon || '77.66';
    const force = req.query.force === 'true';
    const apiKey = req.headers['x-api-key'] || DEFAULT_API_KEY;

    if (!q) {
      return res.status(400).json({ error: 'Search query "q" is required' });
    }

    const cacheKey = `${platform}:${lat}:${lon}:${q.toLowerCase().trim()}`;
    const cachedItem = cache.get(cacheKey);

    if (!force && cachedItem && cachedItem.expiresAt > Date.now()) {
      return res.json({
        ...cachedItem.data,
        cached: true,
        cached_at: cachedItem.cachedAt,
        credits_remaining: lastCreditsRemaining
      });
    }

    const apiUrl = `https://api.quickcommerceapi.com/v1/search?q=${encodeURIComponent(q)}&platform=${encodeURIComponent(platform)}&lat=${lat}&lon=${lon}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    if (data.credits_remaining !== undefined) {
      lastCreditsRemaining = data.credits_remaining;
    }

    // Cache only if results found (never cache empty/failed results)
    if (data.data?.products && data.data.products.length > 0) {
      cache.set(cacheKey, {
        data,
        cachedAt: new Date().toISOString(),
        expiresAt: Date.now() + CACHE_TTL_MS
      });
    }

    res.json({
      ...data,
      cached: false,
      credits_remaining: lastCreditsRemaining
    });
  } catch (error) {
    console.error('Error during search:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Multi-Location Compare
app.post('/api/multi-search', async (req, res) => {
  try {
    const { q, platform = 'Swiggy', locations = [] } = req.body;
    const apiKey = req.headers['x-api-key'] || DEFAULT_API_KEY;

    if (!q) {
      return res.status(400).json({ error: 'Search query "q" is required' });
    }

    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ error: 'Locations array is required' });
    }

    // Limit to max 5 locations at once to prevent credit exhaustion
    const targetLocations = locations.slice(0, 5);
    const results = [];

    for (const loc of targetLocations) {
      const cacheKey = `${platform}:${loc.lat}:${loc.lon}:${q.toLowerCase().trim()}`;
      const cachedItem = cache.get(cacheKey);

      if (cachedItem && cachedItem.expiresAt > Date.now()) {
        results.push({
          location: loc,
          success: true,
          cached: true,
          products: cachedItem.data?.data?.products || [],
          store_id: cachedItem.data?.data?.products?.[0]?.store_id || null,
          total_results: cachedItem.data?.data?.total_results || 0
        });
        continue;
      }

      try {
        const apiUrl = `https://api.quickcommerceapi.com/v1/search?q=${encodeURIComponent(q)}&platform=${encodeURIComponent(platform)}&lat=${loc.lat}&lon=${loc.lon}`;
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: { 'x-api-key': apiKey }
        });
        const data = await response.json();
        
        if (response.ok) {
          if (data.credits_remaining !== undefined) {
            lastCreditsRemaining = data.credits_remaining;
          }
          cache.set(cacheKey, {
            data,
            cachedAt: new Date().toISOString(),
            expiresAt: Date.now() + CACHE_TTL_MS
          });
          results.push({
            location: loc,
            success: true,
            cached: false,
            products: data?.data?.products || [],
            store_id: data?.data?.products?.[0]?.store_id || null,
            total_results: data?.data?.total_results || 0
          });
        } else {
          results.push({
            location: loc,
            success: false,
            error: data?.detail?.message || data?.error || 'Failed to fetch'
          });
        }
      } catch (err) {
        results.push({
          location: loc,
          success: false,
          error: err.message
        });
      }

      // Small delay between calls
      await new Promise(r => setTimeout(r, 200));
    }

    res.json({
      query: q,
      platform,
      credits_remaining: lastCreditsRemaining,
      results
    });
  } catch (error) {
    console.error('Multi-search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Watchlist endpoints
app.get('/api/watchlist', (req, res) => {
  res.json({ watchlist, credits_remaining: lastCreditsRemaining });
});

app.post('/api/watchlist', (req, res) => {
  const item = req.body;
  if (!item || !item.name) {
    return res.status(400).json({ error: 'Item with name is required' });
  }
  const id = item.id || Date.now().toString();
  const newItem = {
    ...item,
    id,
    addedAt: new Date().toISOString(),
    lastChecked: null,
    inStock: item.available ?? false
  };

  const existingIndex = watchlist.findIndex(w => w.id === id || (w.name === item.name && w.lat === item.lat && w.lon === item.lon));
  if (existingIndex >= 0) {
    watchlist[existingIndex] = { ...watchlist[existingIndex], ...newItem };
  } else {
    watchlist.unshift(newItem);
  }
  saveWatchlist();
  res.json({ success: true, item: newItem, watchlist });
});

app.delete('/api/watchlist/:id', (req, res) => {
  watchlist = watchlist.filter(w => w.id !== req.params.id);
  saveWatchlist();
  res.json({ success: true, watchlist });
});

// Test Telegram Bot Webhook / Push
app.post('/api/test-telegram', async (req, res) => {
  try {
    const { botToken, chatId, message } = req.body;
    if (!botToken || !chatId) {
      return res.status(400).json({ error: 'botToken and chatId are required' });
    }
    const text = message || '🚨 *Stock Tracker Alert Test*\nInstamart stock monitoring is active and connected!';
    const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const tgRes = await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });
    const tgData = await tgRes.json();
    res.json(tgData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🛒 QuickCommerce Stock Tracker is running on:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`   Locations supported: ${ALL_LOCATIONS.length} dark store hubs across India`);
    console.log(`   Platforms: Swiggy (Instamart), BlinkIt, Zepto`);
    console.log(`====================================================`);
  });
}

