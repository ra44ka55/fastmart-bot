/**
 * bot.js – Mobile Inventory Radar Telegram Bot
 * Uses grammy (Node 24 compatible) + QuickCommerce API + Playwright scraper
 *
 * Commands:
 *   /start         – Welcome + brand buttons
 *   /help          – Usage guide
 *   /stock <query> – Search phones at current location
 *   /radar <query> – Multi-store scan (4 stores)
 *   /find  <sku>   – Pan-India Instamart locator (all 112 stores)
 *   /location      – Change dark store location
 *   /platform      – Switch platform (Blinkit/Instamart/Zepto)
 *   /alerts        – View & manage restock watchlist
 */

require('dotenv').config();
const { Bot, InlineKeyboard } = require('grammy');
const fs   = require('fs');
const path = require('path');
const { lookupSkuAcrossStores } = require('./scraper');
const { getProductDetails, checkStoreStock, scanStoresForProduct, checkItemRestock, getBrowser, closeBrowser, STORES_DATABASE } = require('./extractor');

// ── Config ──────────────────────────────────────────────────────────────────
const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN || '8843657270:AAFuclk8tF2HtUSW3-QIIOkwM67Ov0PtgfA';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const MAX_STORES = parseInt(process.env.MAX_STORES || '30', 10);

const bot = new Bot(BOT_TOKEN);

bot.catch((err) => {
  console.error('[Grammy Error]', err.ctx?.chat?.id, err.message);
});

bot.use(async (ctx, next) => {
  const sender = ctx.from ? `@${ctx.from.username || ctx.from.first_name} (${ctx.from.id})` : 'unknown';
  if (ctx.message?.text) {
    console.log(`[BOT RECV] [${sender}] "${ctx.message.text}"`);
  } else if (ctx.callbackQuery) {
    console.log(`[BOT CALLBACK] [${sender}] "${ctx.callbackQuery.data}"`);
  }
  await next();
});

// ── Persistent State ─────────────────────────────────────────────────────────
const USERS_FILE  = path.join(__dirname, 'bot_users.json');
const ALERTS_FILE = path.join(__dirname, 'bot_alerts.json');

let userState   = {};
let activeAlerts = [];

try { userState    = JSON.parse(fs.readFileSync(USERS_FILE,  'utf8')); } catch (_) {}
try { activeAlerts = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8')); } catch (_) {}

function saveState() {
  fs.writeFileSync(USERS_FILE,  JSON.stringify(userState,    null, 2));
  fs.writeFileSync(ALERTS_FILE, JSON.stringify(activeAlerts, null, 2));
}

function getUser(chatId) {
  const id = String(chatId);
  if (!userState[id]) {
    userState[id] = { platform: 'Instamart', cityName: 'All India Dark Stores', lat: 12.9116, lon: 77.6389 };
    saveState();
  }
  if (userState[id].platform === 'BlinkIt') {
    userState[id].platform = 'Instamart';
    saveState();
  }
  return userState[id];
}

function extractInstamartItemId(input) {
  if (!input) return null;
  const str = String(input).trim();
  const urlMatch = str.match(/item\/([A-Za-z0-9]{8,12})/i);
  if (urlMatch) return urlMatch[1];
  const directMatch = str.match(/^([A-Z0-9]{8,12})$/i);
  if (directMatch) return directMatch[1];
  const itemPrefix = str.match(/^Item\s+([A-Z0-9]{8,12})$/i);
  if (itemPrefix) return itemPrefix[1];
  return null;
}

// ── Mobile Phone Filter ──────────────────────────────────────────────────────
function isActualMobilePhone(p) {
  const name  = (p.name  || '').toLowerCase();
  const brand = (p.brand || '').toLowerCase();
  const blacklist = ['holder','mount','stand','cover','case','tempered','glass',
    'screen protector','cable','charger','adapter','skin','pouch','ring','strap',
    'cleaning','protector','lens','guard','converter'];
  if (blacklist.some(b => name.includes(b))) return false;
  const phoneKw  = ['iphone','galaxy','pro max','plus','ultra','gb,','gb ','dual sim',
    'single sim','smartphone','mobile','phone','5g','keypad','2g keypad'];
  const brandKw  = ['apple','samsung','oneplus','google','nothing','motorola',
    'nokia','lava','xiaomi','redmi','realme','vivo','oppo','poco','iqoo'];
  return phoneKw.some(k => name.includes(k)) || brandKw.some(b => brand.includes(b) || name.includes(b));
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function chunkMessage(text, limit = 4000) {
  const chunks = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > limit) { chunks.push(cur); cur = line; }
    else cur = cur ? cur + '\n' + line : line;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function escapeMd(str) {
  if (!str) return '';
  return String(str).replace(/[_*`\[\]()~>#+=|{}.!-]/g, ' ');
}

function parseProductAndLocation(rawText) {
  if (!rawText) return null;
  const decoded = decodeURIComponent(rawText).replace(/^\/check\s+/i, '').trim();
  const itemMatch = decoded.match(/(?:instamart\.in\/(?:item|item-details)\/|swiggy\.com\/instamart\/(?:item|item-details|p)(?:\/--|\/)|[?&](?:item_?id|itemId|sku)=|\/p\/--?|\/item\/)([A-Z0-9_-]{6,16})/i);
  let itemId = null, rawUrl = null, location = '';
  if (itemMatch) {
    itemId = itemMatch[1].replace(/^--/, '').toUpperCase();
    const urlMatch = decoded.match(/https?:\/\/[^\s]+/i);
    rawUrl = urlMatch ? urlMatch[0] : `https://instamart.in/item/${itemId}`;
    location = decoded.replace(rawUrl, '').replace(/https?:\/\/[^\s]+/gi, '').trim().replace(/^(?:in|at)\s+/i, '').trim();
  } else {
    const parts = decoded.split(/\s+/);
    if (/^[A-Z0-9]{8,12}$/i.test(parts[0])) {
      itemId = parts[0].toUpperCase();
      rawUrl = `https://instamart.in/item/${itemId}`;
      location = parts.slice(1).join(' ').trim().replace(/^(?:in|at)\s+/i, '').trim();
    }
  }
  return itemId ? { itemId, rawUrl, location } : null;
}

async function safeReply(ctx, text, opts = {}) {
  try {
    return await ctx.reply(text, { parse_mode: 'Markdown', ...opts });
  } catch (err) {
    console.warn('[safeReply] Markdown failed, retrying plain text:', err.message);
    return await ctx.reply(text.replace(/[*_`\[\]()]/g, ' '), { ...opts, parse_mode: undefined });
  }
}

async function safeEditMessageText(ctx, messageId, text, opts = {}) {
  try {
    return await ctx.api.editMessageText(ctx.chat.id, messageId, text, { parse_mode: 'Markdown', ...opts });
  } catch (err) {
    try {
      return await ctx.api.editMessageText(ctx.chat.id, messageId, text.replace(/[*_`\[\]()]/g, ' '), { ...opts, parse_mode: undefined });
    } catch (_) {}
  }
}

async function sendLong(ctx, text) {
  for (const chunk of chunkMessage(text)) {
    try {
      await ctx.reply(chunk, { parse_mode: 'Markdown', disable_web_page_preview: true });
    } catch (err) {
      console.warn('[sendLong] Markdown failed, sending plain text:', err.message);
      await ctx.reply(chunk.replace(/[*_`\[\]()]/g, ' '), { disable_web_page_preview: true });
    }
  }
}

async function apiSearch(q, platform, lat, lon, force = false) {
  const localUrl = `http://localhost:3000/api/search?q=${encodeURIComponent(q)}&platform=${encodeURIComponent(platform)}&lat=${lat}&lon=${lon}&force=${force}`;

  try {
    const res = await fetch(localUrl, { signal: AbortSignal.timeout(1000) });
    if (res.ok) return await res.json();
  } catch (_) {}

  return { status: 'error', data: { products: [] } };
}

// ── /start ───────────────────────────────────────────────────────────────────
bot.command('start', async (ctx) => {
  console.log(`[CMD /start] Received from user: @${ctx.from?.username || ctx.from?.first_name} (${ctx.from?.id})`);
  const msg =
`👋 *Welcome to FastMartX*

Paste any product link below to check real-time availability across dark stores.

📍 *How to check stock:*
• *Pan-India Scan:* Just paste the Swiggy Instamart product link.
• *State-Wise Scan:* Paste link + State (e.g. \`<link> Maharashtra\` or \`<link> UP\`).
• *City-Wise Scan:* Paste link + City (e.g. \`<link> Delhi\` or \`<link> Bengaluru\`).
• *Pinpoint Area:* Paste link + pincode (e.g. \`<link> 110001\`).

⚡ *Direct Command:*
\`/check <Product Link> <State, City, or Pincode>\`

_Send your product link to begin._`;

  try {
    await ctx.reply(msg, { parse_mode: 'Markdown' });
    console.log(`[CMD /start] Successfully replied to ${ctx.from?.id}`);
  } catch (err) {
    console.error('[CMD /start error]', err.message);
    await ctx.reply(msg.replace(/[*_`]/g, ''));
  }
});

// ── /help ────────────────────────────────────────────────────────────────────
bot.command('help', async (ctx) => {
  await ctx.reply(
`📋 *Instructions & Usage:*

1️⃣ *State-Wise Dark Store Radar:*
Send product link + State name:
\`https://instamart.in/item/DLFPE2IS3Q Maharashtra\`
or \`UP\`, \`Karnataka\`, \`Delhi\`, \`Gujarat\`, etc.
→ Scans all dark stores in that entire state.

2️⃣ *City-Wise Dark Store Radar:*
Send product link + City name:
\`https://instamart.in/item/DLFPE2IS3Q Mumbai\`
→ Scans all dark stores across that city.

3️⃣ *Pan-India Dark Store Radar:*
Send just the Instamart product link:
\`https://instamart.in/item/DLFPE2IS3Q\`
→ Scans dark store hubs across all 25+ states in India.

4️⃣ *Instant Stock Alerts:*
If an item is sold out, tap "🔔 Notify Me" to get alerted the second it restocks!`,
    { parse_mode: 'Markdown' }
  );
});

// ── /stock ───────────────────────────────────────────────────────────────────
bot.command('stock', async (ctx) => {
  const query = ctx.match?.trim();
  if (!query) return ctx.reply('Usage: /stock iPhone 16 Pro');
  await searchPhones(ctx, query);
});

// ── /radar ───────────────────────────────────────────────────────────────────
bot.command('radar', async (ctx) => {
  const query = ctx.match?.trim();
  if (!query) return ctx.reply('Usage: /radar Samsung Galaxy S24');
  await scanMultiStores(ctx, query);
});

// ── /find ────────────────────────────────────────────────────────────────────
bot.command('find', async (ctx) => {
  const sku = ctx.match?.trim();
  if (!sku) {
    return ctx.reply(
`❓ *Usage:* /find <SKU or product name>

*Examples:*
\`/find iPhone 16 Pro Max\`
\`/find Samsung Galaxy S24 Ultra\`
\`/find 4873621\`

_Scans up to ${MAX_STORES} Instamart dark stores across India!_`,
      { parse_mode: 'Markdown' }
    );
  }
  await findSkuAcrossIndia(ctx, sku);
});

// ── /location ─────────────────────────────────────────────────────────────────
bot.command('location', async (ctx) => sendLocationMenu(ctx));

// ── /platform ────────────────────────────────────────────────────────────────
bot.command('platform', async (ctx) => sendPlatformMenu(ctx));

// ── /alerts ──────────────────────────────────────────────────────────────────
bot.command('alerts', async (ctx) => showMyAlerts(ctx));

// ── /alert <url or itemId> ──────────────────────────────────────────────────
bot.command(['alert', 'notify', 'watch'], async (ctx) => {
  const text = ctx.message?.text || '';
  const parts = text.split(/\s+/).slice(1).join(' ').trim();
  if (!parts) {
    return ctx.reply(
      `🔔 *Set Restock Alert:*\n\n` +
      `Command: \`/alert <Instamart URL ya Item ID>\`\n\n` +
      `*Example:*\n` +
      `\`/alert https://instamart.in/item/33Z7DLYFP5\`\n` +
      `\`/alert 33Z7DLYFP5\`\n\n` +
      `_Item kisi bhi dark store mein In-Stock aate hi aapko turant alert notification aa jayega!_`,
      { parse_mode: 'Markdown' }
    );
  }

  const itemId = extractInstamartItemId(parts) || parts;
  const user = getUser(ctx.chat.id);
  const chatId = String(ctx.chat.id);

  const exists = activeAlerts.some(a => String(a.chatId) === chatId && (a.itemId === itemId || a.query === parts));
  if (exists) {
    return ctx.reply(`⚠️ *Alert Already Set!*\nAap pehle se hi \`${itemId}\` ke restock ka wait kar rahe hain. Stock aate hi aapko message mil jayega!`, { parse_mode: 'Markdown' });
  }

  const newAlert = {
    id: `alert_${Date.now()}`,
    chatId: chatId,
    itemId: itemId,
    query: parts,
    productName: `Item ${itemId}`,
    platform: 'Swiggy',
    lat: user.lat,
    lon: user.lon,
    cityName: user.cityName || 'All India Dark Stores',
    wasInStock: false,
    addedAt: new Date().toISOString()
  };

  activeAlerts.push(newAlert);
  saveState();

  return ctx.reply(
    `🔔 *Restock Alert Activated!* 🟢\n\n` +
    `📦 Item ID: \`${escapeMd(itemId)}\`\n` +
    `🏪 Monitored Hubs: *${escapeMd(newAlert.cityName)}*\n\n` +
    `_Monitoring chalu ho gayi hai. Jab bhi ye item In-Stock aayega, bot aapko Telegram par direct link ke sath alert bhej dega!_`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('❌ Remove Alert', `alert_del_${newAlert.id}`)
    }
  );
});

/**
 * Geocode an address, area, city or pincode in India
 */
async function resolveAddressToCoords(query) {
  const q = (query || '').trim();
  if (!q) return null;

  // 1. Check if it matches any active dark store in our database directly
  const localMatch = STORES_DATABASE.find(s => 
    s.name.toLowerCase().includes(q.toLowerCase()) || 
    s.city.toLowerCase().includes(q.toLowerCase())
  );

  // 2. Lookup via OpenStreetMap Nominatim for exact pinpoint coordinates
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=in&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FastMartRadar/1.0' },
      signal: AbortSignal.timeout(6000)
    });
    const data = await res.json();
    if (data && data.length > 0) {
      const best = data[0];
      const nameParts = (best.display_name || '').split(',').slice(0, 3).join(', ');
      return {
        name: nameParts || q,
        city: best.address?.city || best.address?.state_district || (localMatch ? localMatch.city : 'India'),
        lat: parseFloat(parseFloat(best.lat).toFixed(4)),
        lon: parseFloat(parseFloat(best.lon).toFixed(4))
      };
    }
  } catch (err) {
    console.log('[resolveAddressToCoords] Nominatim error:', err.message);
  }

  // Fallback to local dark store match if available
  if (localMatch) {
    return {
      name: `${localMatch.name}, ${localMatch.city}`,
      city: localMatch.city,
      lat: localMatch.lat,
      lon: localMatch.lon
    };
  }

  return null;
}

/**
 * Check stock for a specific product at a specific location, or across all dark stores in a State or City
 */
async function checkProductAtLocation(ctx, itemId, addressQuery, rawUrl = null) {
  const qClean = (addressQuery || '').trim();
  const qLower = qClean.toLowerCase();
  console.log(`[checkProductAtLocation] Item: ${itemId} | Query: "${qClean}"`);

  // 0. Check if user requested a PAN-INDIA / ALL-INDIA scan
  const PAN_INDIA_KEYWORDS = [
    'all india', 'pan india', 'india', 'all', 'bharat', 'all stores',
    'everywhere', 'whole india', 'full india', 'poora india', 'pura india',
    'poore india', 'sab', 'saare', 'sare', 'pan-india', 'all-india', 'complete'
  ];

  const isPanIndia = PAN_INDIA_KEYWORDS.some(k => qLower === k || qLower === `all ${k}` || qLower === `in ${k}`);
  if (isPanIndia) {
    console.log(`[checkProductAtLocation] Routing to Full Pan-India scan for ${itemId}`);
    return findByInstamartUrl(ctx, itemId, rawUrl);
  }

  // 1. Check if user requested a CITY scan (matches any city in STORES_DATABASE or CITY_ALIASES)
  const CITY_ALIASES = {
    'maysur': 'Mysuru', 'mysore': 'Mysuru', 'mysuru': 'Mysuru',
    'bangalore': 'Bengaluru', 'bengaluru': 'Bengaluru', 'blr': 'Bengaluru',
    'bombay': 'Mumbai', 'mumbai': 'Mumbai', 'mum': 'Mumbai',
    'calcutta': 'Kolkata', 'kolkata': 'Kolkata', 'kol': 'Kolkata',
    'madras': 'Chennai', 'chennai': 'Chennai',
    'gurgaon': 'Gurugram', 'gurugram': 'Gurugram', 'ggn': 'Gurugram',
    'baroda': 'Vadodara', 'vadodara': 'Vadodara',
    'cochin': 'Kochi', 'kochi': 'Kochi',
    'trivandrum': 'Thiruvananthapuram', 'thiruvananthapuram': 'Thiruvananthapuram',
    'calicut': 'Kozhikode', 'kozhikode': 'Kozhikode',
    'vizag': 'Visakhapatnam', 'visakhapatnam': 'Visakhapatnam',
    'trichy': 'Tiruchirappalli', 'tiruchirappalli': 'Tiruchirappalli',
    'pondicherry': 'Puducherry', 'puducherry': 'Puducherry', 'pondi': 'Puducherry', 'pndicherry': 'Puducherry', 'pondy': 'Puducherry', 'pondichery': 'Puducherry', 'puduchery': 'Puducherry',
    'banaras': 'Varanasi', 'kashi': 'Varanasi', 'varanasi': 'Varanasi',
    'allahabad': 'Prayagraj', 'prayagraj': 'Prayagraj',
    'poona': 'Pune', 'pune': 'Pune',
    'simla': 'Shimla', 'shimla': 'Shimla'
  };

  const normalizedCity = CITY_ALIASES[qLower] || qClean;

  const cityStores = STORES_DATABASE.filter(s => 
    s.city.toLowerCase() === normalizedCity.toLowerCase() ||
    s.city.toLowerCase() === qClean.toLowerCase() ||
    s.city.toLowerCase().includes(normalizedCity.toLowerCase()) ||
    normalizedCity.toLowerCase().includes(s.city.toLowerCase())
  );

  // If it matches any known city
  if (cityStores.length >= 1) {
    const cityName = cityStores[0].city;
    const progressMsg = await safeReply(
      ctx,
      `🔎 *Scanning ${cityName} Dark Stores...*\n\n` +
      `📦 Item ID: \`${itemId}\`\n` +
      `🏬 Total Stores: *${cityStores.length} dark stores in ${cityName}*\n` +
      `⏳ [░░░░░░░░░░] 0%\n\n` +
      `_Connecting to Swiggy Instamart inventory..._`
    );

    let lastEditAt = Date.now();

    try {
      const { scanned, found, productName } = await scanStoresForProduct(
        itemId,
        cityStores,
        6, // 6 concurrent workers (safe for VPS stability)
        async (done, total, foundCount, store, capturedName, storeRes) => {
          if (storeRes && storeRes.inStock) {
            const maps = `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lon}`;
            const pStr = storeRes.price ? ` | ₹${storeRes.price}` : '';
            safeReply(
              ctx,
              `🎯 *STOCK FOUND IN ${cityName.toUpperCase()}!* 🟢\n` +
              `🏪 Dark Store: *${escapeMd(store.name)}*${pStr}\n` +
              `🗺️ [Open Google Maps Location](${maps})`,
              { disable_web_page_preview: true }
            ).catch(() => {});
          }

          if (progressMsg && (Date.now() - lastEditAt > 2000 || done === total)) {
            lastEditAt = Date.now();
            const percent = Math.floor((done / total) * 100);
            const barLen = 10;
            const filled = Math.round((percent / 100) * barLen);
            const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
            const pDisplay = capturedName ? escapeMd(capturedName).slice(0, 32) + '...' : `Item ${itemId}`;

            await safeEditMessageText(ctx, progressMsg.message_id,
              `🔎 *Scanning ${cityName} Dark Stores...*\n\n` +
              `📦 Item: *${pDisplay}*\n` +
              `[${bar}] *${percent}%*\n` +
              `⏳ Scanned: *${done}/${total}* stores\n` +
              `✅ In Stock in: *${foundCount}* store(s)\n\n` +
              `_📍 Checking: ${escapeMd(store.name)}_`
            ).catch(() => {});
          }
        }
      );

      if (progressMsg) {
        await ctx.api.deleteMessage(ctx.chat.id, progressMsg.message_id).catch(() => {});
      }

      const itemLink = rawUrl || `https://instamart.in/item/${itemId}`;
      const pName = escapeMd(productName) || `Item ${itemId}`;

      if (found.length === 0) {
        return safeReply(
          ctx,
          `❌ *OUT OF STOCK in ${cityName}*\n\n` +
          `🏷 *Product:* ${pName}\n` +
          `🔗 [View on Instamart](${itemLink})\n` +
          `🏬 Stores Checked: *All ${scanned} dark stores across ${cityName}*\n\n` +
          `⚠️ *Status:* This product is currently *Sold Out* across all dark stores in ${cityName}.\n` +
          `_Tip: Click below to get notified the second it restocks in ${cityName}!_`,
          {
            disable_web_page_preview: true,
            reply_markup: new InlineKeyboard().text(`🔔 Notify Me When In Stock in ${cityName}`, `alert_item_${itemId}_${encodeURIComponent(cityName)}`)
          }
        );
      }

      let report =
        `🎯 *CITY INVENTORY REPORT: ${cityName.toUpperCase()}*\n\n` +
        `🏷 *Product:* ${pName}\n` +
        `🔗 [Product Link](${itemLink})\n` +
        `✅ *Found In Stock in ${found.length} / ${scanned} Dark Store(s):*\n\n` +
        `─────────────────────────\n`;

      found.forEach(({ store, price }, idx) => {
        const maps = `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lon}`;
        const pStr = price ? ` ₹${price}` : '';
        report += `*${idx + 1}. ${escapeMd(store.name)}* (🟢 IN STOCK)\n`;
        report += `   🗺️ *Location:* [View on Google Maps](${maps})\n`;
        if (pStr) report += `   💰 *Price:* ${pStr}\n`;
        report += `─────────────────────────\n`;
      });

      return sendLong(ctx, report);
    } catch (err) {
      console.error('[city scan error]', err.message);
      if (progressMsg) await ctx.api.deleteMessage(ctx.chat.id, progressMsg.message_id).catch(() => {});
      return safeReply(ctx, `⚠️ *City Scan Error:*\n\`${err.message}\``);
    }
  }

  // State Name Aliases / Normalization (All 36 States & Union Territories of India)
  const STATE_ALIASES = {
    // 28 States
    'andhra pradesh': 'Andhra Pradesh', 'andhra': 'Andhra Pradesh', 'ap': 'Andhra Pradesh', 'andhra pardesh': 'Andhra Pradesh',
    'arunachal pradesh': 'Arunachal Pradesh', 'arunachal': 'Arunachal Pradesh',
    'assam': 'Assam', 'as': 'Assam', 'asom': 'Assam',
    'bihar': 'Bihar', 'br': 'Bihar',
    'chhattisgarh': 'Chhattisgarh', 'cg': 'Chhattisgarh', 'chhatisgarh': 'Chhattisgarh', 'chattisgarh': 'Chhattisgarh',
    'goa': 'Goa',
    'gujarat': 'Gujarat', 'guj': 'Gujarat', 'gujrat': 'Gujarat',
    'haryana': 'Haryana', 'hr': 'Haryana',
    'himachal pradesh': 'Himachal Pradesh', 'himachal': 'Himachal Pradesh', 'hp': 'Himachal Pradesh', 'himachal pardesh': 'Himachal Pradesh',
    'jharkhand': 'Jharkhand', 'jh': 'Jharkhand', 'jharkand': 'Jharkhand',
    'karnataka': 'Karnataka', 'kar': 'Karnataka', 'karnatka': 'Karnataka', 'karnatak': 'Karnataka', 'karnatakar': 'Karnataka',
    'kerala': 'Kerala', 'kl': 'Kerala', 'keralam': 'Kerala',
    'madhya pradesh': 'Madhya Pradesh', 'mp': 'Madhya Pradesh', 'madhyapradesh': 'Madhya Pradesh', 'madhya pardesh': 'Madhya Pradesh',
    'maharashtra': 'Maharashtra', 'mh': 'Maharashtra', 'maharastra': 'Maharashtra', 'maharshtra': 'Maharashtra',
    'manipur': 'Manipur',
    'meghalaya': 'Meghalaya',
    'mizoram': 'Mizoram',
    'nagaland': 'Nagaland',
    'odisha': 'Odisha', 'orissa': 'Odisha',
    'punjab': 'Punjab', 'pb': 'Punjab', 'panjab': 'Punjab',
    'rajasthan': 'Rajasthan', 'raj': 'Rajasthan', 'rajastan': 'Rajasthan', 'rajsthan': 'Rajasthan',
    'sikkim': 'Sikkim',
    'tamil nadu': 'Tamil Nadu', 'tamilnadu': 'Tamil Nadu', 'tn': 'Tamil Nadu', 'tamilnad': 'Tamil Nadu',
    'telangana': 'Telangana', 'ts': 'Telangana', 'telengana': 'Telangana',
    'tripura': 'Tripura',
    'uttar pradesh': 'Uttar Pradesh', 'up': 'Uttar Pradesh', 'uttarpradesh': 'Uttar Pradesh', 'uttar pardesh': 'Uttar Pradesh',
    'uttarakhand': 'Uttarakhand', 'uk': 'Uttarakhand', 'uttaranchal': 'Uttarakhand',
    'west bengal': 'West Bengal', 'westbengal': 'West Bengal', 'wb': 'West Bengal', 'paschim banga': 'West Bengal',

    // 8 Union Territories
    'andaman and nicobar islands': 'Andaman and Nicobar Islands', 'andaman': 'Andaman and Nicobar Islands', 'nicobar': 'Andaman and Nicobar Islands',
    'chandigarh': 'Chandigarh', 'chd': 'Chandigarh',
    'dadra and nagar haveli and daman and diu': 'Dadra and Nagar Haveli and Daman and Diu', 'daman': 'Dadra and Nagar Haveli and Daman and Diu', 'diu': 'Dadra and Nagar Haveli and Daman and Diu', 'silvassa': 'Dadra and Nagar Haveli and Daman and Diu', 'dadra': 'Dadra and Nagar Haveli and Daman and Diu',
    'delhi': 'Delhi', 'ncr': 'Delhi', 'new delhi': 'Delhi', 'dehli': 'Delhi', 'dilli': 'Delhi',
    'jammu & kashmir': 'Jammu & Kashmir', 'jammu and kashmir': 'Jammu & Kashmir', 'j&k': 'Jammu & Kashmir', 'jammu': 'Jammu & Kashmir', 'kashmir': 'Jammu & Kashmir',
    'ladakh': 'Ladakh', 'leh': 'Ladakh',
    'lakshadweep': 'Lakshadweep',
    'puducherry': 'Puducherry', 'pondicherry': 'Puducherry', 'pondi': 'Puducherry', 'pndicherry': 'Puducherry', 'pondy': 'Puducherry', 'pondichery': 'Puducherry', 'puduchery': 'Puducherry'
  };

  let normalizedState = STATE_ALIASES[qLower];
  if (!normalizedState) {
    for (const [alias, state] of Object.entries(STATE_ALIASES)) {
      if (qLower.length >= 4 && (qLower.startsWith(alias) || alias.startsWith(qLower))) {
        normalizedState = state;
        break;
      }
    }
  }

  // 2. Check if user requested a STATE scan
  let stateStores = [];
  if (normalizedState) {
    stateStores = STORES_DATABASE.filter(s => s.state && s.state.toLowerCase() === normalizedState.toLowerCase());
  } else {
    stateStores = STORES_DATABASE.filter(s => s.state && s.state.toLowerCase() === qLower);
  }

  if (stateStores.length > 0) {
    const stateName = stateStores[0].state;
    const progressMsg = await safeReply(
      ctx,
      `🏛️ *Scanning Dark Stores in ${stateName.toUpperCase()}...*\n\n` +
      `📦 Item ID: \`${itemId}\`\n` +
      `🏬 Total Stores: *${stateStores.length} dark stores across ${stateName}*\n` +
      `⏳ [░░░░░░░░░░] 0%\n\n` +
      `_Connecting to Swiggy Instamart inventory..._`
    );

    let lastEditAt = Date.now();

    try {
      const { scanned, found, productName } = await scanStoresForProduct(
        itemId,
        stateStores,
        6, // 6 concurrent workers (safe for VPS stability)
        async (done, total, foundCount, store, capturedName, storeRes) => {
          if (storeRes && storeRes.inStock) {
            const maps = `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lon}`;
            const pStr = storeRes.price ? ` | ₹${storeRes.price}` : '';
            safeReply(
              ctx,
              `🎯 *STOCK FOUND IN ${stateName.toUpperCase()}!* 🟢\n` +
              `🏪 Dark Store: *${escapeMd(store.name)}* (${escapeMd(store.city)})\n` +
              `💰 Price: ${pStr || 'Standard'}\n` +
              `🗺️ [Open Google Maps Location](${maps})`,
              { disable_web_page_preview: true }
            ).catch(() => {});
          }

          if (progressMsg && (Date.now() - lastEditAt > 2000 || done === total)) {
            lastEditAt = Date.now();
            const percent = Math.floor((done / total) * 100);
            const barLen = 10;
            const filled = Math.round((percent / 100) * barLen);
            const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
            const pDisplay = capturedName ? escapeMd(capturedName).slice(0, 32) + '...' : `Item ${itemId}`;

            await safeEditMessageText(ctx, progressMsg.message_id,
              `🏛️ *Scanning Dark Stores in ${stateName.toUpperCase()}...*\n\n` +
              `📦 Item: *${pDisplay}*\n` +
              `[${bar}] *${percent}%*\n` +
              `⏳ Scanned: *${done}/${total}* stores\n` +
              `✅ In Stock in: *${foundCount}* store(s)\n\n` +
              `_📍 Checking: ${escapeMd(store.city || store.name)}_`
            ).catch(() => {});
          }
        }
      );

      if (progressMsg) {
        await ctx.api.deleteMessage(ctx.chat.id, progressMsg.message_id).catch(() => {});
      }

      const itemLink = rawUrl || `https://instamart.in/item/${itemId}`;
      const pName = escapeMd(productName) || `Item ${itemId}`;

      if (found.length === 0) {
        return safeReply(
          ctx,
          `❌ *OUT OF STOCK Across ${stateName}*\n\n` +
          `🏷 *Product:* ${pName}\n` +
          `🔗 [View on Instamart](${itemLink})\n` +
          `🏬 Stores Checked: *All ${scanned} dark stores across ${stateName}*\n\n` +
          `⚠️ *Status:* This product is currently *Sold Out* across the entire state of ${stateName}.\n` +
          `_Tip: Click below to get notified the second it restocks in ${stateName}!_`,
          {
            disable_web_page_preview: true,
            reply_markup: new InlineKeyboard().text(`🔔 Notify Me When In Stock in ${stateName}`, `alert_item_${itemId}_${encodeURIComponent(stateName)}`)
          }
        );
      }

      let report =
        `🎯 *STATE INVENTORY REPORT: ${stateName.toUpperCase()}*\n\n` +
        `🏷 *Product:* ${pName}\n` +
        `🔗 [Product Link](${itemLink})\n` +
        `✅ *Found In Stock in ${found.length} / ${scanned} Dark Store(s):*\n\n` +
        `─────────────────────────\n`;

      found.forEach(({ store, price }, idx) => {
        const maps = `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lon}`;
        const pStr = price ? ` ₹${price}` : '';
        report += `*${idx + 1}. ${escapeMd(store.name)}* – ${escapeMd(store.city)} (🟢 IN STOCK)\n`;
        report += `   🗺️ *Location:* [View on Google Maps](${maps})\n`;
        if (pStr) report += `   💰 *Price:* ${pStr}\n`;
        report += `─────────────────────────\n`;
      });

      return sendLong(ctx, report);
    } catch (err) {
      console.error('[state scan error]', err.message);
      if (progressMsg) await ctx.api.deleteMessage(ctx.chat.id, progressMsg.message_id).catch(() => {});
      return safeReply(ctx, `⚠️ *State Scan Error:*\n\`${err.message}\``);
    }
  }

  // 3. Otherwise: Specific Pin-Point Address / Area / Pincode check
  const loading = await safeReply(
    ctx,
    `📍 *Checking Stock at Location...*\n\n` +
    `📦 Item ID: \`${itemId}\`\n` +
    `🗺️ Resolving address: _"${escapeMd(addressQuery)}"_...`
  );

  try {
    const loc = await resolveAddressToCoords(addressQuery);
    if (!loc) {
      if (loading) await ctx.api.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
      return safeReply(
        ctx,
        `⚠️ *Location Not Found:*\n` +
        `Could not pinpoint coordinates for: _"${escapeMd(addressQuery)}"_.\n\n` +
        `💡 *Tip:* Try providing city name or 6-digit pincode, e.g.:\n` +
        `\`/check https://instamart.in/item/${itemId} Delhi\`\n` +
        `\`/check https://instamart.in/item/${itemId} 110001\``
      );
    }

    if (loading) {
      await safeEditMessageText(
        ctx,
        loading.message_id,
        `🔎 *Checking Live Swiggy Instamart Inventory...*\n\n` +
        `📦 Item ID: \`${itemId}\`\n` +
        `📍 Target Store/Area: *${escapeMd(loc.name)}*\n` +
        `🌐 GPS: \`${loc.lat}, ${loc.lon}\`\n\n` +
        `_Injecting real dark store location cookie..._`
      ).catch(() => {});
    }

    const browser = await getBrowser();
    const result = await checkStoreStock(browser, loc, itemId);

    if (loading) await ctx.api.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});

    const maps = `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lon}`;
    const itemLink = rawUrl || `https://instamart.in/item/${itemId}`;
    const pName = escapeMd(result.productName) || `Item ${itemId}`;

    if (result.inStock) {
      const priceStr = result.price ? `\n💰 *Price:* ₹${result.price}` : '';
      return safeReply(
        ctx,
        `🎯 *STOCK STATUS: IN STOCK (AVAILABLE!)* 🟢\n\n` +
        `🏷 *Product:* ${pName}\n` +
        `📍 *Location:* ${escapeMd(loc.name)} (${escapeMd(loc.city)})\n` +
        `🗺️ [View on Google Maps](${maps})${priceStr}\n` +
        `🔗 [Order on Swiggy Instamart](${itemLink})\n\n` +
        `✅ *Verified:* Live dark store has confirmed delivery & active Add button for this address.`,
        { disable_web_page_preview: true }
      );
    } else {
      return safeReply(
        ctx,
        `❌ *STOCK STATUS: OUT OF STOCK / UNSERVICEABLE* 🔴\n\n` +
        `🏷 *Product:* ${pName}\n` +
        `📍 *Location:* ${escapeMd(loc.name)} (${escapeMd(loc.city)})\n` +
        `🗺️ [View on Google Maps](${maps})\n` +
        `🔗 [View on Instamart](${itemLink})\n\n` +
        `⚠️ *Verified:* This product is currently *Sold Out* or not deliverable at this address.\n` +
        `_Tip: Click below to get alerted when stock arrives at this location!_`,
        {
          disable_web_page_preview: true,
          reply_markup: new InlineKeyboard().text(`🔔 Notify Me When In Stock Here`, `alert_add_${encodeURIComponent(pName.slice(0, 24))}`)
        }
      );
    }
  } catch (err) {
    console.error('[checkProductAtLocation error]', err.message);
    if (loading) await ctx.api.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
    return safeReply(ctx, `⚠️ *Check Failed:*\n\`${err.message}\``);
  }
}

// ── /check ───────────────────────────────────────────────────────────────────
bot.command('check', async (ctx) => {
  const match = (ctx.match || '').trim();
  if (!match) {
    return safeReply(
      ctx,
      `❓ *Usage:* \`/check <Product URL or Item ID> <State, City, or Pincode>\`\n\n` +
      `*Examples:*\n` +
      `• \`/check https://instamart.in/item/2BU8T8KIMO Delhi\`\n` +
      `• \`/check https://instamart.in/item/DLFPE2IS3Q UP\`\n` +
      `• \`/check https://instamart.in/item/DLFPE2IS3Q 110001\`\n\n` +
      `_Directly checks if that product is in stock across dark stores in that area!_`
    );
  }

  const parsed = parseProductAndLocation(match);
  if (!parsed) {
    return safeReply(
      ctx,
      `⚠️ *Could not recognize product link or Item ID:*\n` +
      `Please provide a valid Swiggy Instamart item URL or 8-12 character Item ID.\n\n` +
      `Example:\n\`/check https://instamart.in/item/2BU8T8KIMO Delhi\``
    );
  }

  console.log(`[CMD /check] Item: ${parsed.itemId} | Loc: "${parsed.location}"`);

  if (parsed.location) {
    checkProductAtLocation(ctx, parsed.itemId, parsed.location, parsed.rawUrl).catch(err => {
      console.error('[checkProductAtLocation error]', err);
    });
  } else {
    findByInstamartUrl(ctx, parsed.itemId, parsed.rawUrl).catch(err => {
      console.error('[findByInstamartUrl error]', err);
    });
  }
});

// ── searchPhones ─────────────────────────────────────────────────────────────
async function searchPhones(ctx, rawQuery) {
  let query = (rawQuery || '').trim();
  query = query
    .replace(/^Buy\s+/i, '')
    .replace(/\s+Online\s+\(1 Unit\)\s+At Best Price/i, '')
    .replace(/\s+Online\s+At Best Price/i, '');
  if (query.includes('|')) {
    query = query.split('|')[0].trim();
  }
  const cleanQuery = query.slice(0, 35);
  const user = getUser(ctx.chat.id);
  const loading = await ctx.reply(`🔍 *Scanning for "${cleanQuery}"...*`, { parse_mode: 'Markdown' });

  try {
    const data   = await apiSearch(cleanQuery, user.platform, user.lat, user.lon);
    const phones = (data.data?.products || []).filter(isActualMobilePhone);

    // Delete loading message
    await ctx.api.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});

    if (phones.length === 0) {
      const kb = new InlineKeyboard()
        .text(`🔔 Alert When Restocked`, `alert_add_${encodeURIComponent(cleanQuery.slice(0,24))}`).row()
        .text(`🏪 Check Nearby Stores`, `radar_${encodeURIComponent(cleanQuery.slice(0,24))}`);
      return ctx.reply(
`❌ *OUT OF STOCK: "${cleanQuery}"*

🏪 Store: *${user.cityName}*
🛒 Platform: *${user.platform}*

_No matching phone found in this dark store right now._
_Tip: Paste direct Instamart link for Pan-India scan!_`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
    }

    let text = `📱 *${phones.length} Phone(s) Found: "${cleanQuery}"*\n`;
    text += `📍 Store: *${user.cityName}*  |  🛒 *${user.platform}*\n\n`;

    phones.slice(0, 5).forEach((p, i) => {
      const status = p.available ? '🟢 IN STOCK' : '🔴 OUT OF STOCK';
      const qty    = p.inventory !== undefined ? `• Qty: *${p.inventory}*` : '';
      const price  = p.offer_price ? `₹${p.offer_price}` : (p.mrp ? `₹${p.mrp}` : 'N/A');
      const safeName = (p.name || '').replace(/[*_`\[\]]/g, ' ');
      text += `*${i+1}. ${safeName}*\n`;
      text += `   ${status} ${qty}\n`;
      text += `   💰 *${price}*  (MRP: ₹${p.mrp || '-'})\n`;
      if (p.deeplink) text += `   🔗 [Order Now](${p.deeplink})\n`;
      text += '\n';
    });

    const kb = new InlineKeyboard()
      .text('🔔 Watch & Get Restock Alerts', `alert_add_${encodeURIComponent(cleanQuery.slice(0,24))}`).row()
      .text('🏪 Multi-Store Radar', `radar_${encodeURIComponent(cleanQuery.slice(0,24))}`);

    await ctx.reply(text, { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: kb });

  } catch (err) {
    await ctx.api.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
    await ctx.reply(`⚠️ Could not complete search right now. Please paste an Instamart product link instead.`);
  }
}

// ── scanMultiStores ───────────────────────────────────────────────────────────
async function scanMultiStores(ctx, query) {
  const user    = getUser(ctx.chat.id);
  const loading = await ctx.reply(`📡 *Scanning 4 stores for "${query}"...*`, { parse_mode: 'Markdown' });

  const locations = [
    { city: 'Bengaluru', name: 'HSR Layout',   lat: 12.9116, lon: 77.6389 },
    { city: 'Bengaluru', name: 'Indiranagar',  lat: 12.9784, lon: 77.6408 },
    { city: 'Delhi',     name: 'Connaught Pl', lat: 28.6304, lon: 77.2177 },
    { city: 'Gurugram',  name: 'Cyber City',   lat: 28.4950, lon: 77.0890 },
  ];

  try {
    const res  = await fetch(`${SERVER_URL}/api/multi-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, platform: user.platform, locations })
    });
    const data = await res.json();
    await ctx.api.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});

    let text = `🏪 *Multi-Store Radar: "${query}"*\nPlatform: *${user.platform}*\n\n`;
    (data.results || []).forEach(r => {
      const phones = (r.products || []).filter(isActualMobilePhone);
      const top    = phones[0];
      const icon   = top?.available ? '🟢' : '🔴';
      const status = top?.available ? `IN STOCK – ₹${top.offer_price || top.mrp}` : 'OUT OF STOCK';
      text += `${icon} *${r.location.city} – ${r.location.name}*\n`;
      text += `   ${status}\n`;
      if (top) text += `   ${top.name.slice(0, 36)}\n`;
      text += '\n';
    });

    const kb = new InlineKeyboard()
      .text('🔔 Watch Across All Stores', `alert_add_${encodeURIComponent(query.slice(0,24))}`);
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });

  } catch (err) {
    await ctx.api.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
    await ctx.reply(`⚠️ Radar error: ${err.message}`);
  }
}

// ── findSkuAcrossIndia ────────────────────────────────────────────────────────
async function findSkuAcrossIndia(ctx, sku) {
  const progressMsg = await ctx.reply(
`🔍 *Pan-India Instamart Scanner Started!*

SKU / Product: \`${sku}\`
📡 Scanning up to *${MAX_STORES} dark stores* across India...
_(This may take 2–5 minutes — I'll update you live!)_`,
    { parse_mode: 'Markdown' }
  );

  const matches    = [];
  let scanned      = 0;
  let lastEditAt   = Date.now();

  try {
    await lookupSkuAcrossStores(sku, async (store, product, done, total) => {
      scanned = done;
      if (product && product.available !== false) matches.push({ location: store, product });

      if (Date.now() - lastEditAt > 5000 || done % 5 === 0) {
        lastEditAt = Date.now();
        await ctx.api.editMessageText(ctx.chat.id, progressMsg.message_id,
`📡 *Pan-India Scanner: "${sku}"*

Progress: *${done}/${total}* stores checked
✅ Found in: *${matches.length}* store(s) so far...

_Last: ${store.city} – ${store.name}_`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      }
    });

    if (matches.length === 0) {
      return ctx.api.editMessageText(ctx.chat.id, progressMsg.message_id,
`❌ *Not Found Anywhere in India*

Product / SKU: \`${sku}\`
Stores scanned: *${scanned}*

_No Instamart store has this item in stock right now._

💡 Try a broader keyword like \`iPhone 16\` instead of an exact code.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }

    let result =
      `📦 *Pan-India Results: "${sku}"*\n` +
      `Found in *${matches.length}* Instamart store(s)!\n` +
      `_(${scanned} stores scanned)_\n\n`;

    matches.forEach(({ location, product }, idx) => {
      const price   = product.offer_price ? `₹${product.offer_price}` : (product.mrp ? `₹${product.mrp}` : 'N/A');
      const mrp     = product.mrp ? ` (MRP ₹${product.mrp})` : '';
      const qty     = product.inventory !== undefined ? `📦 Qty: ${product.inventory} units\n` : '';
      const maps    = `https://maps.google.com/?q=${location.lat},${location.lon}`;
      const storeId = product.store_id ? ` (Store #${product.store_id})` : '';

      result += `*${idx+1}. ${location.city} – ${location.name}*${storeId}\n`;
      result += `   📍 \`${location.lat}, ${location.lon}\`\n`;
      result += `   🗺 [Google Maps](${maps})\n`;
      result += `   💰 *${price}*${mrp}\n`;
      if (qty) result += `   ${qty}`;
      if (product.name) result += `   🏷 ${product.name}\n`;
      if (product.deeplink) result += `   🔗 [Order on Instamart](${product.deeplink})\n`;
      result += '\n';
    });

    await ctx.api.deleteMessage(ctx.chat.id, progressMsg.message_id).catch(() => {});
    await sendLong(ctx, result);

  } catch (err) {
    console.error('[/find error]', err.message);
    await ctx.api.editMessageText(ctx.chat.id, progressMsg.message_id,
      `⚠️ *Scanner Error*\n\n\`${err.message}\`\n\nPlease try again.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
}

// ── Location Menu ─────────────────────────────────────────────────────────────
async function sendLocationMenu(ctx) {
  const kb = new InlineKeyboard()
    .text('📍 Bengaluru HSR',     'loc_blr_hsr').text('📍 Bengaluru Indira', 'loc_blr_indira').row()
    .text('📍 Delhi CP',          'loc_del_cp').text('📍 Gurugram Cyber',   'loc_ggn_cyber').row()
    .text('📍 Mumbai Bandra',     'loc_mum_bandra').text('📍 Noida Sec-18',  'loc_noida_18').row()
    .text('📍 Hyderabad HITEC',   'loc_hyd_hitec').text('📍 Pune Koregaon', 'loc_pune_kp').row()
    .text('📍 Chennai T.Nagar',   'loc_che_tnagar').text('📍 Kolkata SaltLk','loc_kol_sl');

  await ctx.reply(
    `📍 *Select Your Dark Store:*\n_Or send any 6-digit pincode in chat!_`,
    { parse_mode: 'Markdown', reply_markup: kb }
  );
}

// ── Platform Menu ─────────────────────────────────────────────────────────────
async function sendPlatformMenu(ctx) {
  const user = getUser(ctx.chat.id);
  const kb = new InlineKeyboard()
    .text(`${user.platform==='BlinkIt'?'✅ ':''}🟡 Blinkit (Best for Phones)`, 'set_plat_BlinkIt').row()
    .text(`${user.platform==='Swiggy'?'✅ ':''}🟠 Swiggy Instamart`,          'set_plat_Swiggy')
    .text(`${user.platform==='Zepto'?'✅ ':''}🟣 Zepto`,                       'set_plat_Zepto');

  await ctx.reply(
    `🛒 *Select Platform:*\nCurrent: *${user.platform}*`,
    { parse_mode: 'Markdown', reply_markup: kb }
  );
}

// ── My Alerts ────────────────────────────────────────────────────────────────
async function showMyAlerts(ctx) {
  const myAlerts = activeAlerts.filter(a => String(a.chatId) === String(ctx.chat.id));
  if (!myAlerts.length) {
    return ctx.reply(`⭐ *No phones on your Watchlist.*\n\nSearch a phone and tap "🔔 Watch & Get Restock Alerts".`, { parse_mode: 'Markdown' });
  }
  let text = `📱 *Your Watchlist (${myAlerts.length}):*\n\n`;
  const kb = new InlineKeyboard();
  myAlerts.forEach((a, i) => {
    text += `*${i+1}. ${a.query}*\n   ${a.cityName} | ${a.platform}\n\n`;
    kb.text(`❌ Remove "${a.query.slice(0,16)}"`, `alert_del_${a.id}`).row();
  });
  await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
}

// ── Callback Queries ──────────────────────────────────────────────────────────
const LOC_MAP = {
  loc_blr_hsr:   { name: 'Bengaluru – HSR Layout',    lat: 12.9116, lon: 77.6389 },
  loc_blr_indira:{ name: 'Bengaluru – Indiranagar',   lat: 12.9784, lon: 77.6408 },
  loc_del_cp:    { name: 'Delhi – Connaught Place',   lat: 28.6304, lon: 77.2177 },
  loc_ggn_cyber: { name: 'Gurugram – Cyber City',     lat: 28.4950, lon: 77.0890 },
  loc_mum_bandra:{ name: 'Mumbai – Bandra West',      lat: 19.0596, lon: 72.8295 },
  loc_noida_18:  { name: 'Noida – Sector 18',         lat: 28.5708, lon: 77.3260 },
  loc_hyd_hitec: { name: 'Hyderabad – HITEC City',    lat: 17.4474, lon: 78.3762 },
  loc_pune_kp:   { name: 'Pune – Koregaon Park',      lat: 18.5362, lon: 73.8940 },
  loc_che_tnagar:{ name: 'Chennai – T. Nagar',        lat: 13.0418, lon: 80.2341 },
  loc_kol_sl:    { name: 'Kolkata – Salt Lake',       lat: 22.5804, lon: 88.4378 },
};

bot.on('callback_query', async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const data   = ctx.callbackQuery.data;
  const chatId = ctx.chat.id;

  if (data === 'phone_apple')   return searchPhones(ctx, 'iPhone');
  if (data === 'phone_samsung') return searchPhones(ctx, 'Samsung Galaxy');
  if (data === 'phone_oneplus') return searchPhones(ctx, 'OnePlus');
  if (data === 'phone_nothing') return searchPhones(ctx, 'Nothing Phone');
  if (data === 'phone_keypad')  return searchPhones(ctx, 'Keypad Mobile');
  if (data === 'btn_location')  return sendLocationMenu(ctx);
  if (data === 'btn_platform')  return sendPlatformMenu(ctx);
  if (data === 'btn_alerts')    return showMyAlerts(ctx);
  if (data === 'btn_radar')     return ctx.reply('Send: `/radar <phone name>` e.g. `/radar iPhone 16`', { parse_mode: 'Markdown' });

  if (data.startsWith('set_plat_')) {
    const plat = data.replace('set_plat_', '');
    const user = getUser(chatId); user.platform = plat; saveState();
    return ctx.reply(`✅ *Platform set to ${plat}*`, { parse_mode: 'Markdown' });
  }

  if (data.startsWith('loc_')) {
    const target = LOC_MAP[data];
    if (target) {
      const user = getUser(chatId);
      user.cityName = target.name; user.lat = target.lat; user.lon = target.lon;
      saveState();
      return ctx.reply(`📍 *Location set to: ${target.name}*`, { parse_mode: 'Markdown' });
    }
  }

  if (data.startsWith('radar_')) {
    const query = decodeURIComponent(data.replace('radar_', ''));
    return scanMultiStores(ctx, query);
  }

  if (data.startsWith('alert_item_') || data.startsWith('alert_add_')) {
    const raw = data.replace(/^alert_(item|add)_/, '');
    const parts = raw.split('_');
    const itemIdOrQuery = decodeURIComponent(parts[0]);
    const targetCity = parts[1] ? decodeURIComponent(parts[1]) : (getUser(chatId).cityName || 'All India Dark Stores');

    const itemId = extractInstamartItemId(itemIdOrQuery) || itemIdOrQuery;
    const user = getUser(chatId);

    const exists = activeAlerts.some(a => String(a.chatId) === String(chatId) && (a.itemId === itemId || a.query === itemIdOrQuery));
    if (exists) {
      return ctx.reply(`⚠️ *Alert Already Set!*\nAap pehle se hi is item ke in-stock aane ka wait kar rahe hain. Jaise hi stock aayega, aapko notification mil jayega!`, { parse_mode: 'Markdown' });
    }

    const pName = itemIdOrQuery.startsWith('Item ') ? itemIdOrQuery : (itemIdOrQuery.length > 8 ? itemIdOrQuery : `Item ${itemId}`);

    const newAlert = {
      id: `alert_${Date.now()}`,
      chatId: String(chatId),
      itemId: itemId,
      query: itemIdOrQuery,
      productName: pName,
      platform: 'Swiggy',
      lat: user.lat,
      lon: user.lon,
      cityName: targetCity,
      wasInStock: false,
      addedAt: new Date().toISOString()
    };

    activeAlerts.push(newAlert);
    saveState();

    return ctx.reply(
      `🔔 *Restock Alert Activated!* 🟢\n\n` +
      `📦 Product: *${escapeMd(newAlert.productName)}*\n` +
      `🆔 Item ID: \`${escapeMd(itemId)}\`\n` +
      `🏪 Target: *${escapeMd(targetCity)}*\n` +
      `🛒 Platform: *Swiggy Instamart*\n\n` +
      `_Bot har 2-3 minute mein dark stores monitor karega. Jaise hi ye item In-Stock aayega, aapko yaha direct notification aa jayega!_`,
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text(`❌ Cancel Alert`, `alert_del_${newAlert.id}`)
      }
    );
  }

  if (data.startsWith('alert_del_')) {
    activeAlerts = activeAlerts.filter(a => a.id !== data.replace('alert_del_', ''));
    saveState();
    return ctx.reply('🗑️ Alert removed.');
  }
});

// ── ALL_LOCATIONS for pan-India scan ────────────────────────────────────────
const { ALL_LOCATIONS } = require('./server');

// ── Instamart URL patterns ───────────────────────────────────────────────────
const INSTAMART_URL_RE = /(?:instamart\.in\/(?:item|item-details)\/|swiggy\.com\/instamart\/(?:item|item-details|p)(?:\/--|\/)|[?&](?:item_?id|itemId|sku)=|\/p\/--?|\/item\/)([A-Z0-9_-]{6,16})/i;

/**
 * Fetch real product name from the Instamart page HTML.
 * Reads og:title or <title> meta without needing a full browser.
 * Returns { name, brand } or null if page can't be fetched.
 */
async function getProductNameFromUrl(itemUrl) {
  try {
    const res = await fetch(itemUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Referer': 'https://instamart.in/',
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Try og:title first (most accurate)
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
                 || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
    if (ogTitle && ogTitle.length > 3 && !ogTitle.toLowerCase().includes('instamart')) {
      return { name: ogTitle.trim() };
    }

    // Try JSON-LD structured data
    const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        if (ld.name) return { name: ld.name, brand: ld.brand?.name };
      } catch (_) {}
    }

    // Fallback: <title> tag — strip " - Instamart" suffix
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    if (titleMatch) {
      const cleaned = titleMatch
        .replace(/[-|–]\s*(instamart|swiggy)[^-|–]*/gi, '')
        .replace(/buy\s+online[^-|–]*/gi, '')
        .trim();
      if (cleaned.length > 3) return { name: cleaned };
    }

    return null;
  } catch (err) {
    console.log('[getProductName] fetch failed:', err.message);
    return null;
  }
}


/**
 * Pan-India scan using the QuickCommerce API (fast, uses credits).
 * Scans ALL_LOCATIONS (up to MAX_STORES) and collects matching products.
 *
 * @param {string} productQuery  – product name or ID to search
 * @param {string} platform      – 'Swiggy' | 'BlinkIt' | 'Zepto'
 * @param {function} onProgress  – callback(location, products, done, total)
 * @returns {Promise<Array<{location, product}>>}
 */
async function panIndiaScanViaApi(productQuery, platform, onProgress = () => {}) {
  const stores  = ALL_LOCATIONS.slice(0, MAX_STORES);
  const matches = [];

  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];
    try {
      const data = await apiSearch(productQuery, platform, store.lat, store.lon, false);
      const products = data.data?.products || [];

      // Find best match: exact item_id OR name contains the query keyword
      const ql = productQuery.toLowerCase();
      const match = products.find(p =>
        (p.item_id && p.item_id.toLowerCase() === ql) ||
        (p.id      && p.id.toLowerCase()      === ql) ||
        (p.sku     && p.sku.toLowerCase()      === ql) ||
        (p.name    && p.name.toLowerCase().includes(ql))
      ) || products[0]; // fallback to first result if only 1 product returned

      if (match && match.available !== false) {
        matches.push({ location: store, product: match });
      }

      onProgress(store, match || null, i + 1, stores.length);
    } catch (err) {
      console.error(`[panIndia] ${store.city}:`, err.message);
      onProgress(store, null, i + 1, stores.length);
    }

    // Small throttle to avoid rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  return matches;
}

/**
 * Handle an Instamart product URL sent by the user.
 * Uses Custom Inventory Extractor (Playwright geolocation context).
 * Zero 3rd-party API reliance, 100% Free & Direct.
 */
async function findByInstamartUrl(ctx, itemId, originalUrl, fallbackTitle = null) {
  const progressMsg = await ctx.reply(
`🔗 *Instamart Product Link Detected!*

📦 Item ID: \`${itemId}\`
🛒 Platform: *Swiggy Instamart*
🔍 Extracting product info...`,
    { parse_mode: 'Markdown' }
  );

  // Step 1: Extract real product info directly from Instamart page
  const productInfo = await getProductDetails(itemId);
  let rawProductName = productInfo?.name || fallbackTitle || `Item ${itemId}`;
  if (rawProductName.toLowerCase() === 'instamart' || rawProductName.includes('Online Grocery')) {
    rawProductName = `Item ${itemId}`;
  }
  let productName = rawProductName.replace(/[*_`\[\]]/g, ' ').replace(/\s+/g, ' ').trim();

  await ctx.api.editMessageText(ctx.chat.id, progressMsg.message_id,
`✅ *Product Identified!*

🏷 *${productName.slice(0, 60)}*
${productInfo?.brand ? `🏢 Brand: *${productInfo.brand}*\n` : ''}${productInfo?.price ? `💰 Price: *₹${productInfo.price}*\n` : ''}
📡 *Launching Pan-India Dark Store Radar...*
🔍 Scanning all ${STORES_DATABASE.length} dark store hubs across 48 cities in India...
_(Live updates below)_`,
    { parse_mode: 'Markdown' }
  ).catch(() => {});

  let lastEditAt = Date.now();
  // Full Pan-India coverage: Scan ALL dark stores indexed across India
  const storesToScan = STORES_DATABASE;

  console.log(`[findByInstamartUrl] Starting full pan-India scan for ${itemId} (${productName}) across all ${storesToScan.length} hubs across India...`);

  try {
    const { scanned, found, productName: capturedDOMName } = await scanStoresForProduct(
      itemId,
      storesToScan,
      6, // 6 robust parallel workers (prevents Chromium memory spikes)
      async (done, total, foundCount, store, capturedName, storeRes) => {
        if (capturedName && (productName.startsWith('Item ') || productName === 'Instamart')) {
          productName = capturedName.replace(/[*_`\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
        }

        // Instant live alert the moment a store with stock is hit
        if (storeRes && storeRes.inStock) {
          const maps = `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lon}`;
          const pStr = storeRes.price ? ` | ₹${storeRes.price}` : '';
          safeReply(ctx,
            `🎯 *STOCK FOUND!* 🟢\n` +
            `🏪 *${escapeMd(store.city)}* (${escapeMd(store.name)})${pStr}\n` +
            `🗺️ [View Store Location](${maps})\n` +
            `_(Pan-India scan continuing for more stores...)_`,
            { disable_web_page_preview: true }
          ).catch(() => {});
        }

        if (progressMsg && (Date.now() - lastEditAt > 2000 || done === total)) {
          lastEditAt = Date.now();
          const percent = Math.floor((done / total) * 100);
          const barLen = 10;
          const filled = Math.round((percent / 100) * barLen);
          const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);

          console.log(`[Scan Progress] ${done}/${total} (${percent}%) | Found: ${foundCount} in ${store.city || store.name}`);

          await safeEditMessageText(ctx, progressMsg.message_id,
            `⚡ *Pan-India Dark Store Radar (All ${total} Stores)*\n` +
            `🏷 *${escapeMd(productName).slice(0, 35)}...*\n\n` +
            `[${bar}] *${percent}%*\n` +
            `⏳ Scanned: *${done}/${total}* stores across India\n` +
            `✅ In Stock in: *${foundCount}* store(s)\n\n` +
            `_📍 Checking: ${escapeMd(store.city || store.name)} (${escapeMd(store.state || 'India')})_`
          ).catch(() => {});
        }
      }
    );

    if (capturedDOMName) {
      productName = capturedDOMName.replace(/[*_`\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    if (progressMsg) await ctx.api.deleteMessage(ctx.chat.id, progressMsg.message_id).catch(() => {});

    if (found.length === 0) {
      return safeReply(ctx,
        `❌ *OUT OF STOCK Across All Checked Stores in India*\n\n` +
        `🏷 Product: *${escapeMd(productName)}*\n` +
        `🔗 [View on Instamart](${originalUrl})\n` +
        `🏬 Stores Scanned: *All ${scanned}* dark store hubs across India\n\n` +
        `_Verified: Currently this item is not in stock in any dark store across India._\n` +
        `_Tip: Click below to get alerted when stock arrives!_`,
        {
          reply_markup: new InlineKeyboard().text(`🔔 Notify Me When In Stock`, `alert_item_${itemId}_AllIndia`)
        }
      );
    }

    // Step 3: Build found stores list grouped by State & City
    let result =
      `🎯 *ALL-INDIA DARK STORE AVAILABILITY REPORT*\n\n` +
      `📦 Product: *${escapeMd(productName)}*\n` +
      `🔗 [Product Link](${originalUrl})\n` +
      `✅ *In Stock across ${found.length} Dark Store(s) (out of ${scanned} checked across India):*\n\n` +
      `─────────────────────────\n`;

    const byState = {};
    found.forEach(({ store, price }) => {
      const st = store.state || 'Other';
      if (!byState[st]) byState[st] = {};
      if (!byState[st][store.city]) byState[st][store.city] = [];
      byState[st][store.city].push({ store, price });
    });

    Object.entries(byState).forEach(([state, cities]) => {
      result += `🏛️ *State: ${escapeMd(state.toUpperCase())}*\n`;
      Object.entries(cities).forEach(([city, items]) => {
        result += `📍 *City: ${escapeMd(city)}* (${items.length} store${items.length > 1 ? 's' : ''})\n`;
        items.forEach(({ store, price }) => {
          const maps = `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lon}`;
          const pStr = price ? ` ₹${price}` : '';
          result += `   🟢 *Dark Store:* ${escapeMd(store.name)}\n`;
          result += `   🗺️ *Location:* [Open Google Maps](${maps})\n`;
          if (pStr) result += `   💰 *Price:* ${pStr}\n`;
        });
      });
      result += `─────────────────────────\n`;
    });

    await sendLong(ctx, result);

  } catch (err) {
    console.error('[findByInstamartUrl error]', err.message);
    if (progressMsg) {
      await safeEditMessageText(ctx, progressMsg.message_id,
        `⚠️ *Extraction Error:*\n\`${err.message}\`\n\nPlease try again in a moment.`
      ).catch(() => {});
    }
  }
}


// ── Message Handler (URL / pincode / free-text search) ───────────────────────
bot.on('message:text', async (ctx) => {
  const text     = ctx.message.text?.trim();
  if (!text || text.startsWith('/')) return;
  const chatId = ctx.chat.id;

  console.log(`[BOT INCOMING] "${text}"`);

  // 1. Try unified product & location parser
  const parsed = parseProductAndLocation(text);
  if (parsed) {
    if (parsed.location) {
      console.log(`[BOT LOCATION SCAN] Item: ${parsed.itemId} at "${parsed.location}"`);
      checkProductAtLocation(ctx, parsed.itemId, parsed.location, parsed.rawUrl).catch(err => {
        console.error('[checkProductAtLocation error]', err.message);
      });
      return;
    } else {
      console.log(`[BOT PAN-INDIA SCAN] Item: ${parsed.itemId}`);
      findByInstamartUrl(ctx, parsed.itemId, parsed.rawUrl).catch(err => {
        console.error('[findByInstamartUrl error]', err.message);
      });
      return;
    }
  }

  // 2. 6-digit pincode → auto-locate
  if (/^\d{6}$/.test(text)) {
    const loading = await safeReply(ctx, `📍 *Locating store for pincode ${text}...*`);
    try {
      const res  = await fetch(`${SERVER_URL}/api/geocode?q=${text}`);
      const data = await res.json();
      if (data.results?.length > 0) {
        const m    = data.results[0];
        const user = getUser(chatId);
        user.lat = m.lat; user.lon = m.lon;
        user.cityName = `Pincode ${text} (${(m.name||'').slice(0,20)})`;
        saveState();
        if (loading) await ctx.api.deleteMessage(chatId, loading.message_id).catch(() => {});
        return safeReply(ctx, `✅ *Location set to:* \`${user.cityName}\``);
      }
    } catch (_) {}
    if (loading) await ctx.api.deleteMessage(chatId, loading.message_id).catch(() => {});
    return safeReply(ctx, '⚠️ Could not resolve that pincode. Try a city name.');
  }

  // 3. Free-text → phone search
  searchPhones(ctx, text).catch(err => {
    console.error('[searchPhones error]', err.message);
  });
});


// ── Background Restock Watcher (every 2.5 mins) ─────────────────────────────────
setInterval(async () => {
  if (!activeAlerts.length) return;
  console.log(`[Watcher] Checking ${activeAlerts.length} alert(s) for restock...`);

  for (let i = 0; i < activeAlerts.length; i++) {
    const alert = activeAlerts[i];
    try {
      const itemId = alert.itemId || extractInstamartItemId(alert.query);
      if (itemId) {
        // Fast direct dark store check via checkItemRestock
        const checkResult = await checkItemRestock(itemId, alert.cityName);
        if (checkResult && checkResult.inStock) {
          if (!alert.wasInStock) {
            activeAlerts[i].wasInStock = true;
            saveState();

            const store = checkResult.store;
            const pName = checkResult.productName || alert.productName || `Item ${itemId}`;
            const priceStr = checkResult.price ? `₹${checkResult.price}` : 'Available';
            const itemUrl = alert.url || `https://instamart.in/item/${itemId}`;

            const kb = new InlineKeyboard()
              .url('🛒 Order on Instamart', itemUrl)
              .row()
              .text('✅ Dismiss Alert', `alert_del_${alert.id}`);

            await bot.api.sendMessage(alert.chatId,
`🚨 *RESTOCK ALERT! ITEM IS NOW IN STOCK!* 🟢\n\n` +
`📱 *${escapeMd(pName)}*\n` +
`🏪 *Dark Store:* ${escapeMd(store.city || store.name)} (${escapeMd(store.state || 'India')})\n` +
`💰 *Price:* ${escapeMd(priceStr)}\n` +
`🔗 [Instamart Item Link](${itemUrl})\n\n` +
`⚡ *Hurry! Stock limited ho sakta hai, abhi order karein!*`,
              {
                parse_mode: 'Markdown',
                reply_markup: kb,
                disable_web_page_preview: false
              }
            );
            console.log(`[Watcher] ✅ Restock Alert sent to ${alert.chatId} for ${itemId} in ${store.city}!`);
          }
        } else {
          // Still out of stock
          if (alert.wasInStock) {
            activeAlerts[i].wasInStock = false;
            saveState();
          }
        }
      } else {
        // Fallback keyword alert
        const data = await apiSearch(alert.query, alert.platform, alert.lat, alert.lon, true).catch(() => null);
        if (data && data.data?.products) {
          const phones = (data.data?.products || []).filter(isActualMobilePhone);
          const match  = phones.find(p => p.available === true);
          if (match && !alert.wasInStock) {
            activeAlerts[i].wasInStock = true;
            saveState();
            await bot.api.sendMessage(alert.chatId,
`🚨 *RESTOCK ALERT!* 🚨\n\n📱 *${escapeMd(match.name)}*\n🏪 Store: *${escapeMd(alert.cityName)}*\n💰 Price: ₹${match.offer_price || match.mrp}\n\n⚡ In stock now!`,
              { parse_mode: 'Markdown' }
            );
          }
        }
      }
    } catch (err) {
      console.error(`[Watcher] Alert ${alert.id}:`, err.message);
    }
    // Small delay between alert checks to avoid any load spike
    await new Promise(r => setTimeout(r, 2000));
  }
}, 2.5 * 60 * 1000);

// ── Start Bot ────────────────────────────────────────────────────────────────
console.log('📱 Mobile Inventory Radar Bot starting...');

function runBot() {
  bot.start({
    drop_pending_updates: false,
    onStart: (info) => {
      console.log(`✅ Bot @${info.username} is live and listening on local PC host!`);
      console.log(`   API Server: ${SERVER_URL}`);
      console.log(`   Stores to scan: ${STORES_DATABASE.length}`);
    }
  }).catch((err) => {
    if (err.message && err.message.includes('409')) {
      console.log('⚠️ 409 Conflict: another instance is active. Retrying in 8s...');
      setTimeout(runBot, 8000);
    } else {
      console.error('Bot launch error:', err.message);
      setTimeout(runBot, 5000);
    }
  });
}

process.on('SIGTERM', async () => {
  console.log('[BOT] SIGTERM received. Closing browser and exiting...');
  try { await closeBrowser(); } catch (_) {}
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[BOT] SIGINT received. Closing browser and exiting...');
  try { await closeBrowser(); } catch (_) {}
  process.exit(0);
});

runBot();
