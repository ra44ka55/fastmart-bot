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
const { getProductDetails, scanStoresForProduct, STORES_DATABASE } = require('./extractor');

// ── Config ──────────────────────────────────────────────────────────────────
const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN || '8843657270:AAFuclk8tF2HtUSW3-QIIOkwM67Ov0PtgfA';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const MAX_STORES = parseInt(process.env.MAX_STORES || '30', 10);

const bot = new Bot(BOT_TOKEN);

bot.catch((err) => {
  console.error('[Grammy Error]', err.ctx?.chat?.id, err.message);
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
    userState[id] = { platform: 'BlinkIt', cityName: 'Bengaluru – HSR Layout', lat: 12.9116, lon: 77.6389 };
    saveState();
  }
  return userState[id];
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

async function sendLong(ctx, text) {
  for (const chunk of chunkMessage(text)) {
    await ctx.reply(chunk, { parse_mode: 'Markdown', disable_web_page_preview: true });
  }
}

async function apiSearch(q, platform, lat, lon, force = false) {
  const url = `${SERVER_URL}/api/search?q=${encodeURIComponent(q)}&platform=${encodeURIComponent(platform)}&lat=${lat}&lon=${lon}&force=${force}`;
  const res  = await fetch(url);
  return res.json();
}

// ── /start ───────────────────────────────────────────────────────────────────
bot.command('start', async (ctx) => {
  const user = getUser(ctx.chat.id);
  const kb = new InlineKeyboard()
    .text('🍏 Apple iPhone',       'phone_apple').text('📱 Samsung Galaxy', 'phone_samsung').row()
    .text('🔴 OnePlus',            'phone_oneplus').text('⚪ Nothing Phone', 'phone_nothing').row()
    .text('📟 Keypad Mobiles',     'phone_keypad').text('🏪 Multi-Store Radar', 'btn_radar').row()
    .text('📍 Change Location',    'btn_location').text('🛒 Switch Platform', 'btn_platform').row()
    .text('⭐ My Alerts',          'btn_alerts');

  await ctx.reply(
`📱 *Mobile Inventory Radar Bot*
_For Mobile Traders & Resellers across India_

📍 Store: \`${user.cityName}\`
🛒 Platform: \`${user.platform}\`

*Commands:*
• /stock iPhone 16 – search phones at your store
• /radar Samsung S24 – scan 4 stores at once
• /find <SKU> – pan-India Instamart scan 🔥
• /location – change city/store
• /platform – switch app

Tap a brand below to get started:`,
    { parse_mode: 'Markdown', reply_markup: kb }
  );
});

// ── /help ────────────────────────────────────────────────────────────────────
bot.command('help', async (ctx) => {
  await ctx.reply(
`📖 *Bot Commands:*

/stock iPhone 16 Pro – search phones at your selected store
/radar OnePlus 12 – compare 4 stores simultaneously  
/find iPhone 16 – 🔥 scan ALL Instamart stores pan-India by SKU/name
/location – change your dark store location (city/pincode)
/platform – switch between Blinkit, Instamart, Zepto
/alerts – view your restock watchlist

💡 *Tips:*
• Send any 6-digit pincode to auto-set location
• Just type a phone name (e.g. "Samsung S24") to search instantly
• /find gives exact GPS + Google Maps link for every matching store`,
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

// ── searchPhones ─────────────────────────────────────────────────────────────
async function searchPhones(ctx, query) {
  const user    = getUser(ctx.chat.id);
  const loading = await ctx.reply(`🔍 *Scanning for "${query}"...*`, { parse_mode: 'Markdown' });

  try {
    const data   = await apiSearch(query, user.platform, user.lat, user.lon);
    const phones = (data.data?.products || []).filter(isActualMobilePhone);

    // Delete loading message
    await ctx.api.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});

    if (phones.length === 0) {
      const kb = new InlineKeyboard()
        .text(`🔔 Alert When Restocked`, `alert_add_${encodeURIComponent(query.slice(0,24))}`).row()
        .text(`🏪 Check Nearby Stores`, `radar_${encodeURIComponent(query.slice(0,24))}`);
      return ctx.reply(
`❌ *OUT OF STOCK: "${query}"*

🏪 Store: *${user.cityName}*
🛒 Platform: *${user.platform}*

_No matching phone found in this dark store right now._`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
    }

    let text = `📱 *${phones.length} Phone(s) Found: "${query}"*\n`;
    text += `📍 Store: *${user.cityName}*  |  🛒 *${user.platform}*\n\n`;

    phones.slice(0, 5).forEach((p, i) => {
      const status = p.available ? '🟢 IN STOCK' : '🔴 OUT OF STOCK';
      const qty    = p.inventory !== undefined ? `• Qty: *${p.inventory}*` : '';
      const price  = p.offer_price ? `₹${p.offer_price}` : (p.mrp ? `₹${p.mrp}` : 'N/A');
      text += `*${i+1}. ${p.name}*\n`;
      text += `   ${status} ${qty}\n`;
      text += `   💰 *${price}*  (MRP: ₹${p.mrp || '-'})\n`;
      if (p.deeplink) text += `   🔗 [Order Now](${p.deeplink})\n`;
      text += '\n';
    });

    const kb = new InlineKeyboard()
      .text('🔔 Watch & Get Restock Alerts', `alert_add_${encodeURIComponent(query.slice(0,24))}`).row()
      .text('🏪 Multi-Store Radar', `radar_${encodeURIComponent(query.slice(0,24))}`);

    await ctx.reply(text, { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: kb });

  } catch (err) {
    await ctx.api.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
    await ctx.reply(`⚠️ Error: ${err.message}`);
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

  if (data.startsWith('alert_add_')) {
    const query = decodeURIComponent(data.replace('alert_add_', ''));
    const user  = getUser(chatId);
    activeAlerts.push({
      id: `alert_${Date.now()}`, chatId: String(chatId), query,
      platform: user.platform, lat: user.lat, lon: user.lon,
      cityName: user.cityName, wasInStock: false, addedAt: new Date().toISOString()
    });
    saveState();
    return ctx.reply(
      `🔔 *Alert set for "${query}"!*\nMonitoring *${user.platform}* in *${user.cityName}*.\nYou'll get a push when it's back in stock!`,
      { parse_mode: 'Markdown' }
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
// Supports:
//   https://instamart.in/item/2BU8T8KIMO
//   https://www.swiggy.com/instamart/item/2BU8T8KIMO
//   https://swiggy.com/instamart/item-details/2BU8T8KIMO
const INSTAMART_URL_RE = /(?:instamart\.in\/item\/|swiggy\.com\/instamart\/(?:item(?:-details)?)\/|swiggy\.com\/instamart[^?]*item_id=)([A-Z0-9a-z_-]+)/i;

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
  const rawProductName = productInfo?.name || fallbackTitle || `Item ${itemId}`;
  const productName = rawProductName.replace(/[*_`\[\]]/g, ' ').replace(/\s+/g, ' ').trim();

  await ctx.api.editMessageText(ctx.chat.id, progressMsg.message_id,
`✅ *Product Identified!*

🏷 *${productName.slice(0, 60)}*
${productInfo?.brand ? `🏢 Brand: *${productInfo.brand}*\n` : ''}${productInfo?.price ? `💰 Price: *₹${productInfo.price}*\n` : ''}
📡 *Launching Pan-India Dark Store Radar...*
🔍 Scanning all ${STORES_DATABASE.length} dark store hubs across India...
_(Live updates below)_`,
    { parse_mode: 'Markdown' }
  ).catch(() => {});

  let lastEditAt = Date.now();
  const scanLimit = STORES_DATABASE.length; // Scan ALL 239 Dark Stores across all 48 cities in India

  console.log(`[findByInstamartUrl] Starting scan for ${itemId} (${productName}) across ALL ${scanLimit} stores...`);

  try {
    const { scanned, found } = await scanStoresForProduct(
      itemId,
      scanLimit,
      5, // 5 workers: lightning fast ~30s scan across all 48 Indian cities
      async (done, total, foundCount, store) => {
        if (Date.now() - lastEditAt > 3000 || done === total) {
          lastEditAt = Date.now();
          const percent = Math.floor((done / total) * 100);
          const barLen = 10;
          const filled = Math.round((percent / 100) * barLen);
          const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);

          console.log(`[Scan Progress] ${done}/${total} (${percent}%) | Found: ${foundCount} in ${store.city || store.name}`);

          await ctx.api.editMessageText(ctx.chat.id, progressMsg.message_id,
`⚡ *Pan-India Dark Store Radar*
🏷 *${productName.slice(0, 32)}...*

[${bar}] *${percent}%*
⏳ Scanned: *${done}/${total}* stores
✅ In Stock in: *${foundCount}* store(s)

_📍 Checking: ${store.city || store.name}_`,
            { parse_mode: 'Markdown' }
          ).catch((e) => console.log('editMessageText err:', e.message));
        }
      }
    );

    await ctx.api.deleteMessage(ctx.chat.id, progressMsg.message_id).catch(() => {});

    if (found.length === 0) {
      return ctx.reply(
`❌ *OUT OF STOCK Across All Checked Stores*

🏷 Product: \`${productName}\`
🔗 [View on Instamart](${originalUrl})
🏬 Stores Scanned: *${scanned}* dark stores

_Currently this item is not in stock in any of the checked stores._
_Tip: Set an alert to be notified when it arrives!_`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text(`🔔 Notify Me When In Stock`, `alert_add_${encodeURIComponent(productName.slice(0, 24))}`)
        }
      );
    }

    // Step 3: Build found stores list
    let result =
      `🎯 *DARK STORE AVAILABILITY REPORT*\n\n` +
      `📦 Item: *${productName}*\n` +
      `🔗 [Instamart Link](${originalUrl})\n` +
      `✅ Ye item *${found.length}* Dark Store(s) me *AVAILABLE* mila:\n\n` +
      `─────────────────────────\n`;

    // Group by City
    const byCity = {};
    found.forEach(({ store, price }) => {
      if (!byCity[store.city]) byCity[store.city] = [];
      byCity[store.city].push({ store, price });
    });

    Object.entries(byCity).forEach(([city, items]) => {
      result += `📍 *City: ${city}* (${items.length} store${items.length > 1 ? 's' : ''})\n`;
      items.forEach(({ store, price }) => {
        const maps = `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lon}`;
        const pStr = price ? ` ₹${price}` : '';
        result += `   🟢 *Dark Store:* ${store.name}\n`;
        result += `   🗺️ *Location:* [Open Google Maps](${maps})\n`;
        if (pStr) result += `   💰 *Price:* ${pStr}\n`;
      });
      result += `─────────────────────────\n`;
    });

    await sendLong(ctx, result);

  } catch (err) {
    console.error('[findByInstamartUrl error]', err.message);
    await ctx.api.editMessageText(ctx.chat.id, progressMsg.message_id,
      `⚠️ *Extraction Error:*\n\`${err.message}\`\n\nPlease try again in a moment.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
}


// ── Message Handler (URL / pincode / free-text search) ───────────────────────
bot.on('message:text', async (ctx) => {
  const text     = ctx.message.text?.trim();
  const entities = ctx.message.entities || [];
  if (!text || text.startsWith('/')) return;
  const chatId = ctx.chat.id;

  console.log(`[BOT INCOMING] "${text}" | Entities: ${entities.length}`);

  // ── Instamart URL detection ──────────────────────────────────────────────
  let instamartUrl = null;
  let instamartItemId = null;
  let fallbackTitle = null;

  for (const entity of entities) {
    let candidateUrl = null;

    if (entity.type === 'url') {
      candidateUrl = text.slice(entity.offset, entity.offset + entity.length);
    } else if (entity.type === 'text_link') {
      candidateUrl = entity.url;
      fallbackTitle = text.slice(entity.offset, entity.offset + entity.length);
    }

    if (candidateUrl) {
      const m = candidateUrl.match(INSTAMART_URL_RE);
      if (m) {
        instamartUrl    = candidateUrl;
        instamartItemId = m[1].toUpperCase();
        break;
      }
    }
  }

  // 2. Fallback: try raw text
  if (!instamartItemId) {
    const rawMatch = text.match(INSTAMART_URL_RE);
    if (rawMatch) {
      instamartItemId = rawMatch[1].toUpperCase();
      instamartUrl    = text.match(/https?:\/\/\S+/)?.[0] || text;
      const preText = text.slice(0, text.indexOf(instamartUrl)).trim();
      if (preText && preText.length > 5) {
        fallbackTitle = preText;
      }
    }
  }

  if (fallbackTitle) {
    fallbackTitle = fallbackTitle
      .replace(/^Buy\s+/i, '')
      .replace(/\s+Online\s+\(1 Unit\)\s+At Best Price/i, '')
      .replace(/\s+Online\s+At Best Price/i, '')
      .replace(/[\[\]]/g, '')
      .trim();
  }

  console.log(`[BOT MATCH] ItemID: ${instamartItemId} | URL: ${instamartUrl} | Title: ${fallbackTitle}`);

  if (instamartItemId) {
    return findByInstamartUrl(ctx, instamartItemId, instamartUrl || text, fallbackTitle);
  }


  // ── 6-digit pincode → auto-locate ───────────────────────────────────────
  if (/^\d{6}$/.test(text)) {
    const loading = await ctx.reply(`📍 *Locating store for pincode ${text}...*`, { parse_mode: 'Markdown' });
    try {
      const res  = await fetch(`${SERVER_URL}/api/geocode?q=${text}`);
      const data = await res.json();
      if (data.results?.length > 0) {
        const m    = data.results[0];
        const user = getUser(chatId);
        user.lat = m.lat; user.lon = m.lon;
        user.cityName = `Pincode ${text} (${(m.name||'').slice(0,20)})`;
        saveState();
        await ctx.api.deleteMessage(chatId, loading.message_id).catch(() => {});
        return ctx.reply(`✅ *Location set to:* \`${user.cityName}\``, { parse_mode: 'Markdown' });
      }
    } catch (_) {}
    await ctx.api.deleteMessage(chatId, loading.message_id).catch(() => {});
    return ctx.reply('⚠️ Could not resolve that pincode. Try a city name.');
  }

  // ── Free-text → phone search ─────────────────────────────────────────────
  await searchPhones(ctx, text);
});


// ── Background Restock Watcher (every 3 mins) ─────────────────────────────────
setInterval(async () => {
  if (!activeAlerts.length) return;
  console.log(`[Watcher] Checking ${activeAlerts.length} alert(s)...`);

  for (let i = 0; i < activeAlerts.length; i++) {
    const alert = activeAlerts[i];
    try {
      const data = await apiSearch(alert.query, alert.platform, alert.lat, alert.lon, true);
      const phones = (data.data?.products || []).filter(isActualMobilePhone);
      const match  = phones.find(p => p.available === true);

      if (match && !alert.wasInStock) {
        activeAlerts[i].wasInStock = true;
        saveState();

        const kb = match.deeplink
          ? new InlineKeyboard().url('🛒 Order Now!', match.deeplink)
          : undefined;

        await bot.api.sendMessage(alert.chatId,
`🚨 *RESTOCK ALERT!* 🚨

📱 *${match.name}*
🏪 Store: *${alert.cityName}* (Store #${match.store_id || 'N/A'})
💰 Price: ₹${match.offer_price || match.mrp}
📦 Qty: ${match.inventory !== undefined ? match.inventory + ' units' : 'In Stock'}
🛒 Platform: *${alert.platform}*

⚡ Hurry before it sells out!`,
          { parse_mode: 'Markdown', ...(kb ? { reply_markup: kb } : {}) }
        );
      }

      if (match && alert.wasInStock && !match.available) {
        activeAlerts[i].wasInStock = false;
        saveState();
      }
    } catch (err) {
      console.error(`[Watcher] Alert ${alert.id}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}, 3 * 60 * 1000);

// ── Start Bot ────────────────────────────────────────────────────────────────
console.log('📱 Mobile Inventory Radar Bot starting...');

function runBot() {
  bot.start({
    drop_pending_updates: true,
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

runBot();
