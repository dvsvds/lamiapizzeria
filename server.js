/* ============================================================================
   LA MIA PIZZERIA — eigen bestel-/kassasysteem  (backend)
   Fase 1: centraal menu & prijzen.

   Zero-dependency: draait volledig op Node's ingebouwde modules
   (node:http + node:sqlite). Geen `npm install` nodig.

       node server.js            # start op poort 3000
       PORT=8080 node server.js  # of een andere poort

   Wat er nu is:
     - SQLite database (data/lamia.db), bij eerste start gevuld met de kaart
     - Publieke API:   GET /api/menu           (menu voor site/kassa)
     - Beheer-API:     /api/login /api/logout /api/session
                       CRUD /api/admin/products en /api/admin/categories
     - Statische pagina's: /, /order.html, /pos.html, /beheer.html, /images/*

   Beheer-PIN: standaard 1234 (wijzig via omgeving:  ADMIN_PIN=... node server.js
   of later in het beheerscherm). De sessie is een ondertekende cookie.
   ========================================================================== */
'use strict';

var http = require('node:http');
var https = require('node:https');
var fs = require('node:fs');
var path = require('node:path');
var crypto = require('node:crypto');
var zlib = require('node:zlib');
var { DatabaseSync } = require('node:sqlite');
var catalogue = require('./lib/catalogue');

var ROOT = __dirname;
var DATA_DIR = path.join(ROOT, 'data');
var DB_PATH = path.join(DATA_DIR, 'lamia.db');
var PORT = parseInt(process.env.PORT || '3000', 10);
var ADMIN_PIN = String(process.env.ADMIN_PIN || '1234');
var SESSION_HOURS = 12;
var DELIVERY_FEE = parseFloat(process.env.DELIVERY_FEE || '0.00'); // leveringskosten (vervangen door 30% korting bij levering)
var MIN_ORDER = parseFloat(process.env.MIN_ORDER || '20.00');      // minimum bestelbedrag (levering)
var MOLLIE_API_KEY = String(process.env.MOLLIE_API_KEY || '');    // online betalen (Mollie); leeg = uit

/* ---- SEO & Google-koppelingen (zie SEO.md) ---- */
// Publiek adres van de site, zonder slash op het einde. Gebruikt in robots.txt en sitemap.xml.
var SITE_URL = String(process.env.SITE_URL || 'https://www.lamiapizzeria.be').replace(/\/+$/, '');
// Google Analytics 4 meet-ID (G-XXXXXXX). Zet GA_MEASUREMENT_ID=uit om Analytics uit te schakelen. Wordt op de publieke
// pagina's in <head> gezet als window.LAMIA_GA; analytics.js doet de rest (met cookie-toestemming).
var GA_MEASUREMENT_ID = String(process.env.GA_MEASUREMENT_ID || 'G-KEFEYWN9YG').trim(); // property 'webmakers' → lamiapizzeria.be
if (/^(uit|off|none|0)$/i.test(GA_MEASUREMENT_ID)) GA_MEASUREMENT_ID = '';
if (GA_MEASUREMENT_ID && !/^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID)) {
  console.warn('GA_MEASUREMENT_ID ziet er niet uit als een GA4-ID (G-XXXXXXX) en wordt genegeerd: ' + GA_MEASUREMENT_ID);
  GA_MEASUREMENT_ID = '';
}
// Google Search Console: de "content"-waarde van de verificatie-metatag.
var GOOGLE_SITE_VERIFICATION = String(process.env.GOOGLE_SITE_VERIFICATION || '').trim();
if (GOOGLE_SITE_VERIFICATION && !/^[A-Za-z0-9_-]+$/.test(GOOGLE_SITE_VERIFICATION)) {
  console.warn('GOOGLE_SITE_VERIFICATION bevat vreemde tekens en wordt genegeerd.');
  GOOGLE_SITE_VERIFICATION = '';
}
// Enkel deze pagina's zijn publiek en krijgen de Google-tags; beheer/kassa/keuken nooit.
var PUBLIC_PAGES = { 'index.html': 1, 'order.html': 1 };

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---- geheime sleutel voor het ondertekenen van sessies (blijft bewaard) ---- */
var SECRET_PATH = path.join(DATA_DIR, 'secret.key');
var SECRET;
if (fs.existsSync(SECRET_PATH)) {
  SECRET = fs.readFileSync(SECRET_PATH);
} else {
  SECRET = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_PATH, SECRET, { mode: 0o600 });
}

/* ============================================================================
   DATABASE
   ========================================================================== */
var db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec(
  'CREATE TABLE IF NOT EXISTS categories (' +
  '  id TEXT PRIMARY KEY,' +
  '  label TEXT NOT NULL,' +
  '  color TEXT,' +
  "  kind TEXT NOT NULL DEFAULT 'food'," +   // food | drink  (voor BTW)
  '  sort INTEGER DEFAULT 0' +
  ');'
);
db.exec(
  'CREATE TABLE IF NOT EXISTS products (' +
  '  id TEXT PRIMARY KEY,' +
  '  cat TEXT NOT NULL,' +
  "  type TEXT NOT NULL DEFAULT 'simple'," + // simple | pizza | pasta | drink
  '  name TEXT NOT NULL,' +
  "  descr TEXT DEFAULT ''," +
  '  price REAL NOT NULL DEFAULT 0,' +
  '  sizes TEXT,' +                          // JSON [S,M,L] of NULL
  "  tag TEXT DEFAULT ''," +
  '  available INTEGER NOT NULL DEFAULT 1,' +
  '  sort INTEGER DEFAULT 0,' +
  "  img TEXT DEFAULT ''," +
  '  meta TEXT,' +                              // promo-samenstelling (JSON): pizzas/drink/side
  '  color TEXT' +                              // kleur van het kassakaartje (hex) of NULL
  ');'
);
db.exec(
  'CREATE TABLE IF NOT EXISTS settings (' +
  '  key TEXT PRIMARY KEY,' +
  '  value TEXT' +
  ');'
);
db.exec(
  'CREATE TABLE IF NOT EXISTS orders (' +
  '  id INTEGER PRIMARY KEY,' +
  '  no TEXT,' +
  '  created_at TEXT,' +
  '  type TEXT,' +
  '  cust_name TEXT, cust_phone TEXT, cust_email TEXT, cust_address TEXT,' +
  '  tbl TEXT,' +                                // tafelnummer (ter plaatse)
  '  items TEXT,' +
  '  subtotal REAL, discount REAL DEFAULT 0, delivery REAL, total REAL,' +
  '  pay TEXT,' +                                // betaalinfo (JSON, kassa)
  '  vat TEXT,' +                                // BTW per tarief (JSON) — berekend bij opslaan
  '  note TEXT,' +
  '  time_wanted TEXT,' +
  "  status TEXT NOT NULL DEFAULT 'nieuw'," +    // nieuw | bereiden | klaar | afgehaald | betaald
  "  source TEXT NOT NULL DEFAULT 'web'" +        // web | pos
  ');'
);
// De kassa zoekt op bonnummer om te zien of een herkansing al aangekomen is.
// Zonder index wordt dat bij elke bestelling een scan over de hele tabel.
db.exec('CREATE INDEX IF NOT EXISTS idx_orders_no ON orders(no);');

/* categorie → standaardafbeelding voor de webshopkaartjes */
var CAT_IMG = {
  pizza: 'pizza-card', pasta: 'pasta', burger: 'burger', broodje: 'burger',
  kapsalon: 'snacks', lookbrood: 'snacks', snack: 'snacks', friet: 'snacks',
  dessert: 'dessert', drink: 'drinks', promo: 'promo-card'
};
function imgForCat(cat) { return CAT_IMG[cat] || 'pizza-card'; }

/* migratie: kolommen toevoegen aan databases van vóór fase 2/3 */
(function migrate() {
  function has(table, col) { return db.prepare('PRAGMA table_info(' + table + ')').all().some(function (c) { return c.name === col; }); }
  if (!has('products', 'img')) {
    db.exec("ALTER TABLE products ADD COLUMN img TEXT DEFAULT ''");
    db.prepare('SELECT id,cat FROM products').all().forEach(function (r) {
      db.prepare('UPDATE products SET img=? WHERE id=?').run(imgForCat(r.cat), r.id);
    });
  }
  if (!has('orders', 'discount')) db.exec('ALTER TABLE orders ADD COLUMN discount REAL DEFAULT 0');
  if (!has('orders', 'pay')) db.exec('ALTER TABLE orders ADD COLUMN pay TEXT');
  if (!has('orders', 'tbl')) db.exec('ALTER TABLE orders ADD COLUMN tbl TEXT');
  if (!has('orders', 'vat')) db.exec('ALTER TABLE orders ADD COLUMN vat TEXT');
  if (!has('products', 'meta')) db.exec('ALTER TABLE products ADD COLUMN meta TEXT');
  if (!has('products', 'color')) db.exec('ALTER TABLE products ADD COLUMN color TEXT');
  // online betaling (Mollie): betaalstatus + Mollie-betaal-id
  if (!has('orders', 'pay_status')) db.exec("ALTER TABLE orders ADD COLUMN pay_status TEXT DEFAULT 'later'");
  if (!has('orders', 'mollie_id')) db.exec('ALTER TABLE orders ADD COLUMN mollie_id TEXT');
  // een geannuleerde bon blijft staan, maar telt niet mee in de omzet:
  // wanneer en waarom ze geannuleerd is, blijft bewaard voor de boekhouding
  // sleutel die de kassa meestuurt om een herkansing te herkennen. Het bonnummer
  // alleen volstaat niet: dat begint elke dag opnieuw bij 1.
  if (!has('orders', 'client_key')) db.exec('ALTER TABLE orders ADD COLUMN client_key TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_client_key ON orders(client_key);');
  if (!has('orders', 'voided_at')) db.exec('ALTER TABLE orders ADD COLUMN voided_at TEXT');
  if (!has('orders', 'void_reason')) db.exec('ALTER TABLE orders ADD COLUMN void_reason TEXT');
})();
// optionele hex-kleur, of null als er geen ingesteld is
function optColor(c) { return (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : null; }

// automatische kassakleur op basis van ingrediënten (vis/kip/pittig/vlees/veggie)
function classifyColor(name, descr, cat) {
  var t = ((name || '') + ' ' + (descr || '')).toLowerCase();
  if (/tonijn|tuna|ansjovis|anchov|scampi|zeevruchten|frutti di mare|fruits de mer|de mer|calamari|visfilet|\bvis\b|fish/.test(t)) return '#2f80d4'; // vis/zee → blauw
  if (/jalape|pittig|\bhot\b|arrabbiata|diavolo|spicy|pikant/.test(t)) return '#e23a2e';                                                          // pittig → fel rood
  if (/\bkip\b|chicken|pollo|shawarma|shoarma/.test(t)) return '#f2c40f';                                                                         // kip → fel geel
  if (/pepperoni|salami|\bham\b|spek|kofta|kafta|meatball|bacon|\bbbq\b|gehakt|worst|merguez|bickey|\bburger\b|\bvlees\b/.test(t)) return '#6b3f26'; // vlees → donkerbruin
  if (cat === 'pizza' || cat === 'pasta') return '#3fa45a';                                                                                       // overige pizza/pasta → veggie groen
  return null; // andere categorieën → categoriekleur
}

// categorie → soort (food/drink), voor het juiste BTW-tarief
function catKind(catId) {
  if (!catId) return 'food';
  var r = db.prepare('SELECT kind FROM categories WHERE id=?').get(catId);
  return r && r.kind === 'drink' ? 'drink' : 'food';
}
// BTW-tarief (België, prijzen incl. BTW): drank 21%, eten ter plaatse 12%, eten afhaal/levering 6%
function vatRateFor(kind, type) { return kind === 'drink' ? 0.21 : (type === 'terplaatse' ? 0.12 : 0.06); }
// enkel een geldige hex-kleur toelaten (voorkomt HTML-injectie via het kleurveld)
function hexColor(c) { return (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : '#e6b24c'; }

/* ---- openingsuren (Europe/Brussels), sluit om 02:00 (na middernacht) ---- */
var OPEN_MIN = { 0: 14 * 60, 1: 11 * 60 + 30, 2: 11 * 60 + 30, 3: 11 * 60 + 30, 4: 11 * 60 + 30, 5: 11 * 60 + 30, 6: 14 * 60 }; // per weekdag (0=zo)
var CLOSE_MIN = 2 * 60; // 02:00 de volgende ochtend
function belgiumNow(d) {
  var f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  var p = {};
  f.formatToParts(d || new Date()).forEach(function (x) { p[x.type] = x.value; });
  var wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { dow: wd, min: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10) };
}
function isOpenNow(d) {
  try {
    var b = belgiumNow(d);
    if (typeof b.dow !== 'number') return true;   // tijdzonedata onbetrouwbaar → niet blokkeren
    if (b.min < CLOSE_MIN) return true;      // nog open van de vorige dag (sluit pas om 02:00)
    return b.min >= OPEN_MIN[b.dow];         // vanaf de openingstijd van vandaag tot middernacht
  } catch (e) {
    // faalt de tijdzone/Intl (bv. ontbrekende locale-data), dan liever open dan de
    // hele webshop platleggen — de bestelling gaat door.
    return true;
  }
}

/* ---- eerste keer: vul de database met de canonieke kaart ---- */
function seedIfEmpty() {
  var count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (count > 0) return;
  var insCat = db.prepare('INSERT INTO categories (id,label,color,kind,sort) VALUES (?,?,?,?,?)');
  catalogue.CATEGORIES.forEach(function (c) {
    insCat.run(c.id, c.label, c.color || null, c.kind || 'food', c.sort || 0);
  });
  var insProd = db.prepare(
    'INSERT INTO products (id,cat,type,name,descr,price,sizes,tag,available,sort,img,meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
  );
  catalogue.PRODUCTS.forEach(function (p, i) {
    var meta = null;
    if (p.pizzas != null || p.drink != null || p.side != null) {
      meta = {}; if (p.pizzas != null) meta.pizzas = p.pizzas; if (p.drink != null) meta.drink = p.drink; if (p.side != null) meta.side = p.side;
      meta = JSON.stringify(meta);
    }
    insProd.run(
      p.id, p.c, p.t || 'simple', p.name, p.desc || '', p.price,
      p.sz ? JSON.stringify(p.sz) : null, p.tag || '', 1, i, p.img || imgForCat(p.c), meta
    );
  });
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('admin_pin', ADMIN_PIN);
  console.log('  ↳ database gevuld met ' + catalogue.PRODUCTS.length + ' producten in ' + catalogue.CATEGORIES.length + ' categorieën');
}
seedIfEmpty();

// Aparte manager-PIN voor de rapporten (los van de kassa-PIN). Eén keer instellen
// als hij nog niet bestaat — ook op bestaande databases, zonder te overschrijven.
(function seedReportPin() {
  if (!db.prepare('SELECT value FROM settings WHERE key=?').get('report_pin')) {
    db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run('report_pin', String(process.env.REPORT_PIN || '5678'));
  }
})();

// Geef elk product een standaard kassakleur op basis van de ingrediënten.
// Draait één keer per kleurversie. Kleuren van een vorige auto-versie worden
// bijgewerkt naar het nieuwe schema; kleuren die je zélf hebt gekozen blijven staan.
(function seedColorsV2() {
  if (db.prepare('SELECT value FROM settings WHERE key=?').get('colors_v2')) return;
  // hexes van vorige auto-schema's — die mogen we overschrijven met het nieuwe schema
  var AUTO_OLD = { '#4f93c4': 1, '#e0533f': 1, '#e0a33f': 1, '#b5563a': 1, '#5aa469': 1 };
  var upd = db.prepare('UPDATE products SET color=? WHERE id=?');
  db.prepare('SELECT id,name,descr,cat,color FROM products').all().forEach(function (r) {
    var cur = (r.color || '').toLowerCase();
    if (!cur || AUTO_OLD[cur]) { var c = classifyColor(r.name, r.descr, r.cat); if (c) upd.run(c, r.id); }
  });
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('colors_v1', '1');
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('colors_v2', '1');
})();

function currentPin() {
  var row = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_pin');
  return row ? String(row.value) : ADMIN_PIN;
}
function reportPin() {
  var row = db.prepare('SELECT value FROM settings WHERE key = ?').get('report_pin');
  return row ? String(row.value) : String(process.env.REPORT_PIN || '5678');
}

/* ---- rij → net JSON object ---- */
function rowToProduct(r) {
  var out = {
    id: r.id, cat: r.cat, type: r.type, name: r.name, descr: r.descr,
    price: r.price, sizes: r.sizes ? JSON.parse(r.sizes) : null,
    tag: r.tag || '', img: r.img || '', color: r.color || null, available: !!r.available, sort: r.sort
  };
  if (r.meta) { try { Object.assign(out, JSON.parse(r.meta)); } catch (e) {} } // promo: pizzas/drink/side
  return out;
}
function allCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY sort, label').all();
}
function allProducts() {
  return db.prepare('SELECT * FROM products ORDER BY sort, name').all().map(rowToProduct);
}

/* ============================================================================
   SESSIE / AUTHENTICATIE  (ondertekende cookie, geen server-state nodig)
   ========================================================================== */
function sign(payload) {
  var data = Buffer.from(payload).toString('base64url');
  var mac = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return data + '.' + mac;
}
function verify(token) {
  if (!token || token.indexOf('.') < 0) return null;
  var parts = token.split('.');
  var data = parts[0], mac = parts[1];
  var expect = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  try {
    var payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (e) { return null; }
}
function parseCookies(req) {
  var out = {};
  var raw = req.headers.cookie;
  if (!raw) return out;
  raw.split(';').forEach(function (p) {
    var i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isAuthed(req) {
  var token = parseCookies(req)['lamia_sess'];
  return !!verify(token);
}
// aparte manager-sessie voor de rapporten (eigen cookie + rol)
function isManager(req) {
  var p = verify(parseCookies(req)['lamia_mgr']);
  return !!(p && p.role === 'mgr');
}
// kassa-rol: mag online bestellingen bekijken/afvinken en verkopen doorsturen,
// maar NIET het beheer (menu/prijzen) of de rapporten. Wordt verkregen met de
// beheer-PIN (of POS_PIN), één keer per toestel — zie /api/pos/hello.
function isPos(req) {
  var p = verify(parseCookies(req)['lamia_pos']);
  return !!(p && p.role === 'pos');
}

/* ---------------------------------------------------------------------------
   PIN-vergelijking en een rem op raden

   Een PIN van vier cijfers is in seconden door te proberen als je onbeperkt mag
   raden. Per IP houden we de mislukte pogingen bij: vanaf 8 fout volgt een
   wachttijd die oploopt tot een kwartier. Een geslaagde PIN wist de teller.
   --------------------------------------------------------------------------- */
function pinEquals(given, want) {
  var a = crypto.createHash('sha256').update(String(given)).digest();
  var b = crypto.createHash('sha256').update(String(want)).digest();
  return crypto.timingSafeEqual(a, b);
}
var pinTries = new Map();                 // ip -> { n, until }
function pinKey(req) {
  var fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || (req.socket && req.socket.remoteAddress) || 'onbekend';
}
function pinGuard(req) {                  // geeft een melding terug als er nog gewacht moet worden
  var e = pinTries.get(pinKey(req));
  if (e && e.until > Date.now()) {
    var sec = Math.ceil((e.until - Date.now()) / 1000);
    return 'Te veel pogingen. Probeer over ' + sec + ' seconden opnieuw.';
  }
  return null;
}
function pinFailed(req) {
  var k = pinKey(req), e = pinTries.get(k) || { n: 0, until: 0 };
  e.n++;
  if (e.n >= 8) e.until = Date.now() + Math.min(15 * 60e3, Math.pow(2, e.n - 8) * 5e3);
  pinTries.set(k, e);
  if (pinTries.size > 5000) pinTries.clear();   // eenvoudige bovengrens op het geheugen
}
function pinOk(req) { pinTries.delete(pinKey(req)); }

/* ============================================================================
   HTTP HELPERS
   ========================================================================== */
function sendJson(res, code, obj, headers) {
  var body = JSON.stringify(obj);
  var h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {});
  res.writeHead(code, h);
  res.end(body);
}
function readBody(req) {
  return new Promise(function (resolve) {
    var chunks = [];
    var size = 0;
    req.on('data', function (c) { size += c.length; if (size < 1e6) chunks.push(c); });
    req.on('end', function () {
      var s = Buffer.concat(chunks).toString();
      if (!s) return resolve({});
      try { resolve(JSON.parse(s)); } catch (e) { resolve({}); }
    });
    req.on('error', function () { resolve({}); });
  });
}

// ruwe body (voor de Mollie-webhook, die x-www-form-urlencoded stuurt: "id=tr_xxx")
function readRaw(req) {
  return new Promise(function (resolve) {
    var chunks = [], size = 0;
    req.on('data', function (c) { size += c.length; if (size < 1e5) chunks.push(c); });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString()); });
    req.on('error', function () { resolve(''); });
  });
}
// absolute basis-URL van de site (voor Mollie redirect/webhook), uit de request-headers
function baseUrl(req) {
  var proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  var host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return proto + '://' + host;
}
// Mollie REST-API aanroepen via ingebouwde https (geen externe library nodig)
function mollie(method, apiPath, body) {
  return new Promise(function (resolve, reject) {
    var data = body ? JSON.stringify(body) : null;
    var r = https.request({
      hostname: 'api.mollie.com', path: '/v2' + apiPath, method: method,
      headers: {
        'Authorization': 'Bearer ' + MOLLIE_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0
      }, timeout: 15000
    }, function (resp) {
      var s = '';
      resp.on('data', function (c) { s += c; });
      resp.on('end', function () {
        var j = {}; try { j = s ? JSON.parse(s) : {}; } catch (e) {}
        if (resp.statusCode >= 200 && resp.statusCode < 300) resolve(j);
        else reject(new Error('Mollie ' + resp.statusCode + ': ' + (j.detail || s).toString().slice(0, 200)));
      });
    });
    r.on('error', reject);
    r.on('timeout', function () { r.destroy(new Error('Mollie timeout')); });
    if (data) r.write(data);
    r.end();
  });
}

function parseQuery(u) {
  var out = {}, i = u.indexOf('?');
  if (i < 0) return out;
  u.slice(i + 1).split('&').forEach(function (p) {
    var kv = p.split('='); if (kv[0]) out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
  });
  return out;
}
function csvCell(v) {
  if (typeof v === 'number') return String(v).replace('.', ',');   // NL-decimaal
  var s = String(v == null ? '' : v);
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

var MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp4': 'video/mp4', '.webm': 'video/webm'
};
// Enkel deze extensies zijn publiek serveerbaar (blokkeert .db, .key, .json, .md, Dockerfile, …)
var SERVE_EXT = { '.html': 1, '.js': 1, '.css': 1, '.png': 1, '.jpg': 1, '.jpeg': 1, '.svg': 1, '.ico': 1, '.webp': 1, '.woff': 1, '.woff2': 1, '.mp4': 1, '.webm': 1 };
// Deze mappen bevatten interne bestanden en worden nooit geserveerd
var BLOCK_DIR = { data: 1, lib: 1, node_modules: 1, '.git': 1 };
function serveStatic(req, res, urlPath) {
  var rel;
  try { rel = decodeURIComponent(urlPath.split('?')[0]); }
  catch (e) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Ongeldige URL'); }
  if (rel === '/' || rel === '') rel = '/index.html';
  // nette URL's zonder .html:  /order → /order.html,  /pos → /pos.html, enz.
  if (rel !== '/index.html' && !path.extname(rel)) {
    var htmlRel = rel.replace(/\/+$/, '') + '.html';
    var htmlFile = path.join(ROOT, path.normalize(htmlRel).replace(/^(\.\.[\/\\])+/, ''));
    if (htmlFile.indexOf(ROOT) === 0 && fs.existsSync(htmlFile)) rel = htmlRel;
  }
  var safe = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
  var file = path.join(ROOT, safe);
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); return res.end('Verboden'); }
  var relInside = path.relative(ROOT, file).replace(/\\/g, '/');
  var first = relInside.split('/')[0];
  var base = path.basename(file);
  var ext = path.extname(file).toLowerCase();
  // beveiliging: geen interne mappen, verborgen bestanden, de server zelf, of niet-publieke types
  if (BLOCK_DIR[first] || base.charAt(0) === '.' || base === 'server.js' || !SERVE_EXT[ext]) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Niet gevonden');
  }
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Niet gevonden'); }
    // pagina's en code niet cachen → na een update toont de kassa/terminal meteen de nieuwste versie.
    // afbeeldingen/fonts mogen kort gecachet worden (schelen bandbreedte, veranderen zelden).
    var noCache = (ext === '.html' || ext === '.js' || ext === '.css');
    var type = MIME[ext] || 'application/octet-stream';
    var cache = noCache ? 'no-cache, no-store, must-revalidate' : 'public, max-age=604800'; // 7 dagen

    // Video's worden met byte-ranges opgehaald. Safari en iOS weigeren een
    // video af te spelen als de server daar niet met 206 op antwoordt.
    var range = req.headers && req.headers.range;
    var m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] || m[2])) {
      var start = m[1] ? parseInt(m[1], 10) : 0;
      var end = m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (end > st.size - 1) end = st.size - 1;
      if (isNaN(start) || isNaN(end) || start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + st.size });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': cache
      });
      return fs.createReadStream(file, { start: start, end: end }).pipe(res);
    }

    // HTML/JS/CSS: in het geheugen laden, Google-tags injecteren (enkel publieke
    // pagina's) en gecomprimeerd versturen. Scheelt ± 50% op de grote pagina's (de ingebakken fonts persen slecht),
    // wat op mobiel direct in de laadtijd (en Google's Core Web Vitals) telt.
    if (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.svg') {
      return fs.readFile(file, function (err2, buf) {
        if (err2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Niet gevonden'); }
        if (ext === '.html' && PUBLIC_PAGES[base]) buf = Buffer.from(injectHead(buf.toString('utf8')), 'utf8');
        sendCompressed(req, res, 200, buf, { 'Content-Type': type, 'Cache-Control': cache });
      });
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cache
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* ---- Google-tags in <head> van de publieke pagina's ---- */
function injectHead(html) {
  var extra = '';
  if (GOOGLE_SITE_VERIFICATION) extra += '<meta name="google-site-verification" content="' + GOOGLE_SITE_VERIFICATION + '">\n';
  // altijd zetten (ook leeg): zo weet analytics.js dat de server beslist en valt
  // het niet terug op zijn eigen standaard-ID wanneer Analytics uit staat.
  extra += '<script>window.LAMIA_GA=' + JSON.stringify(GA_MEASUREMENT_ID) + ';</script>\n';
  var i = html.indexOf('</head>');
  return i < 0 ? html : html.slice(0, i) + extra + html.slice(i);
}

/* ---- gzip als de browser dat aankan (vrijwel altijd) ---- */
function sendCompressed(req, res, status, buf, headers) {
  var h = Object.assign({ 'Vary': 'Accept-Encoding' }, headers);
  var ae = String((req.headers && req.headers['accept-encoding']) || '');
  if (/\bgzip\b/.test(ae) && buf.length > 1024) {
    buf = zlib.gzipSync(buf, { level: 6 });
    h['Content-Encoding'] = 'gzip';
  }
  h['Content-Length'] = buf.length;
  res.writeHead(status, h);
  res.end(buf);
}

/* ---- robots.txt & sitemap.xml (voor Google Search Console) ----
   Er staan ook statische robots.txt en sitemap.xml in de repo, voor wanneer
   de site zonder server draait (statische hosting zoals Netlify). Deze
   serverversie gaat voor en vult SITE_URL en de laatste wijzigingsdatum in.
   Wijzig je de lijst hier, pas dan ook de statische bestanden aan. */
function robotsTxt() {
  return [
    '# La Mia Pizzeria — enkel de website en de webshop mogen in Google.',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /beheer',
    'Disallow: /pos',
    'Disallow: /keuken',
    'Disallow: /rapporten',
    'Disallow: /start',
    '',
    'Sitemap: ' + SITE_URL + '/sitemap.xml',
    ''
  ].join('\n');
}
function lastmod(name) {
  try { return fs.statSync(path.join(ROOT, name)).mtime.toISOString().slice(0, 10); }
  catch (e) { return new Date().toISOString().slice(0, 10); }
}
function xmlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
function sitemapXml() {
  var img = function (f, title) {
    return '    <image:image><image:loc>' + xmlEsc(SITE_URL + '/images/' + f) + '</image:loc><image:title>' + xmlEsc(title) + '</image:title></image:image>';
  };
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    '  <url>\n    <loc>' + xmlEsc(SITE_URL + '/') + '</loc>\n    <lastmod>' + lastmod('index.html') + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n' +
    img('hero.jpg', 'New York style pizza — La Mia Pizzeria Antwerpen') + '\n' +
    img('pizza-whole.jpg', 'Hele pizza — La Mia Pizzeria') + '\n' +
    img('slice-card.jpg', 'Pizza per slice — La Mia Pizzeria') + '\n' +
    img('pasta.jpg', 'Pasta — La Mia Pizzeria') + '\n' +
    img('interior.jpg', 'Interieur La Mia Pizzeria, Abdijstraat Antwerpen') + '\n' +
    '  </url>\n' +
    '  <url>\n    <loc>' + xmlEsc(SITE_URL + '/order.html') + '</loc>\n    <lastmod>' + lastmod('order.html') + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n' +
    '</urlset>\n';
}

/* ============================================================================
   LIVE UPDATES (Server-Sent Events) — voedt het keukenscherm
   ========================================================================== */
var sseClients = new Set();
function sseWrite(res, event, data) {
  try { res.write('event: ' + event + '\n'); res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch (e) {}
}
function broadcast(event, data) { sseClients.forEach(function (r) { sseWrite(r, event, data); }); }
function orderRow(id) {
  var o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o) return null;
  o.items = o.items ? JSON.parse(o.items) : [];
  o.pay = o.pay ? JSON.parse(o.pay) : null;
  return o;
}

// Kalenderdag (YYYY-MM-DD) in de Belgische tijdzone, voor het per-dag overzicht.
function belgiumDate(iso) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  } catch (e) { return String(iso || '').slice(0, 10); }
}
// Maandag (YYYY-MM-DD) van de week waarin een kalenderdag valt, voor het per-week overzicht.
function weekMonday(ymd) {
  try {
    var p = String(ymd).split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    var dow = (d.getUTCDay() + 6) % 7; // 0 = maandag
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  } catch (e) { return String(ymd || ''); }
}

/* ============================================================================
   API ROUTES
   ========================================================================== */
function validProduct(b) {
  if (!b || typeof b.name !== 'string' || !b.name.trim()) return 'Naam is verplicht';
  if (!b.cat || !db.prepare('SELECT 1 FROM categories WHERE id=?').get(b.cat)) return 'Onbekende categorie';
  if (isNaN(parseFloat(b.price))) return 'Ongeldige prijs';
  return null;
}
function genId(cat) {
  var prefix = (cat || 'p').slice(0, 2).toLowerCase();
  for (var i = 0; i < 10000; i++) {
    var id = prefix + Math.random().toString(36).slice(2, 8);
    if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(id)) return id;
  }
  return prefix + Date.now();
}

async function handleApi(req, res, urlPath) {
  var method = req.method;
  var seg = urlPath.replace(/^\/api\//, '').split('?')[0].split('/').filter(Boolean);

  /* ---------- publiek: menu ---------- */
  if (seg[0] === 'menu' && method === 'GET') {
    var cats = allCategories();
    var prods = allProducts().filter(function (p) { return p.available; });
    return sendJson(res, 200, { categories: cats, products: prods, config: { deliveryFee: DELIVERY_FEE, minOrder: MIN_ORDER, open: isOpenNow(), online: !!MOLLIE_API_KEY } });
  }

  /* ---------- publiek: bestelling plaatsen (webshop) ---------- */
  if (seg[0] === 'orders' && method === 'POST') {
    var ob = await readBody(req);
    var rawItems = Array.isArray(ob.items) ? ob.items : [];
    if (!rawItems.length) return sendJson(res, 400, { error: 'Lege bestelling' });
    var type = ['afhalen', 'leveren', 'terplaatse'].indexOf(ob.type) >= 0 ? ob.type : 'afhalen';
    // Alleen een ingelogde kassa mag een POS-bon (met betaalinfo/eigen nummer) plaatsen.
    // De publieke webshop kan enkel gewone webbestellingen aanmaken.
    var source = ((isAuthed(req) || isPos(req)) && ob.source === 'pos') ? 'pos' : 'web';
    // buiten de openingsuren mag de webshop niet bestellen; de kassa (ingelogd personeel) wel
    if (source === 'web' && !isOpenNow()) {
      return sendJson(res, 403, { error: 'We zijn momenteel gesloten. Online bestellen kan tijdens de openingsuren: ma–vr vanaf 11:30, za–zo vanaf 14:00, elke dag tot 02:00.', closed: true });
    }
    var subtotal = 0;
    var priceError = null;
    var hasPromo = false;
    var items = rawItems.slice(0, 100).map(function (it) {
      var qty = Math.max(1, parseInt(it.qty, 10) || 1);
      var unit = Math.max(0, parseFloat(it.unit) || 0);
      var name = String(it.name || '').slice(0, 120);
      var prod = db.prepare('SELECT cat, price, sizes FROM products WHERE name=?').get(name);
      if ((prod && prod.cat === 'promo') || it.cat === 'promo') hasPromo = true;
      // webshop: prijs valideren tegen de kaart (voorkomt gemanipuleerde lage prijzen)
      if (source === 'web' && prod) {
        var minPrice = prod.sizes ? Math.min.apply(null, JSON.parse(prod.sizes)) : prod.price;
        if (unit < minPrice - 0.01) priceError = name;
      }
      subtotal += unit * qty;
      return {
        name: name,
        opts: Array.isArray(it.opts) ? it.opts.slice(0, 20).map(String) : [],
        note: String(it.note || '').slice(0, 200),
        cat: it.cat ? String(it.cat).slice(0, 30) : (prod ? prod.cat : ''),
        unit: Math.round(unit * 100) / 100, qty: qty
      };
    });
    if (priceError) return sendJson(res, 400, { error: 'Ongeldige prijs voor ' + priceError });
    // promo's gelden enkel bij afhalen; de webshop mag ze niet bij een levering plaatsen
    if (source === 'web' && type === 'leveren' && hasPromo) {
      return sendJson(res, 400, { error: 'Promo’s kunnen enkel afgehaald worden, niet geleverd.' });
    }
    subtotal = Math.round(subtotal * 100) / 100;
    // korting en betaalinfo enkel voor de (ingelogde) kassa
    var discount = (source === 'pos') ? Math.round(Math.max(0, Math.min(parseFloat(ob.discount) || 0, subtotal)) * 100) / 100 : (type === 'leveren' ? Math.round(subtotal * 0.30 * 100) / 100 : 0);
    var delivery = type === 'leveren' ? DELIVERY_FEE : 0;
    var total = Math.round((subtotal - discount + delivery) * 100) / 100;
    // minimum bij levering geldt op het te betalen bedrag (na korting); enkel de webshop afdwingen
    if (source === 'web' && type === 'leveren' && total < MIN_ORDER) {
      return sendJson(res, 400, { error: 'Minimum voor levering is € ' + MIN_ORDER.toFixed(2).replace('.', ',') + ' na korting.' });
    }
    // status = keukenvoortgang (nieuw→bereiden→klaar→afgehaald), los van betaling.
    var status = 'nieuw';

    // BTW berekenen (incl. prijzen). Korting evenredig verdelen; levering telt als eten 6%.
    var factor = subtotal > 0 ? (subtotal - discount) / subtotal : 0;
    var vat = {};
    items.forEach(function (it) {
      var rate = vatRateFor(catKind(it.cat), type);
      var lineAfter = it.unit * it.qty * factor;
      var key = String(Math.round(rate * 100));
      vat[key] = (vat[key] || 0) + (lineAfter - lineAfter / (1 + rate));
    });
    if (delivery > 0) vat['6'] = (vat['6'] || 0) + (delivery - delivery / 1.06);
    Object.keys(vat).forEach(function (k) { vat[k] = Math.round(vat[k] * 100) / 100; });

    var cust = ob.customer || {};
    var now = new Date().toISOString();
    var providedNo = (source === 'pos' && ob.no) ? String(ob.no).slice(0, 20) : null;
    // De kassa bewaart bonnen die niet verstuurd raakten en probeert het later opnieuw.
    // Zo'n herkansing mag geen tweede bon aanmaken: kent de database dit bonnummer al,
    // dan is de vorige poging wél aangekomen en bevestigen we gewoon die bestelling.
    var clientKey = (source === 'pos' && ob.clientKey) ? String(ob.clientKey).slice(0, 60) : null;
    if (providedNo) {
      // Het bonnummer alleen is géén goede sleutel: de kassateller begint elke
      // dag opnieuw bij 1, dus K-0001 komt elke dag terug. Daarom kijken we naar
      // de sleutel die de kassa meestuurt (nummer + datum). Komt die niet mee —
      // een bon uit de wachtrij van een oudere versie — dan vergelijken we op
      // bonnummer binnen dezelfde kalenderdag.
      var dup = clientKey
        ? db.prepare('SELECT id,no,total,type FROM orders WHERE client_key=?').get(clientKey)
        : db.prepare('SELECT id,no,total,type FROM orders WHERE no=? AND substr(created_at,1,10)=?')
            .get(providedNo, new Date().toISOString().slice(0, 10));
      if (dup) {
        return sendJson(res, 200, {
          no: dup.no, id: dup.id, total: dup.total, duplicate: true,
          eta: dup.type === 'leveren' ? '35–50 min' : '20–30 min'
        });
      }
    }
    var payVal = (source === 'pos' && ob.pay) ? JSON.stringify(ob.pay) : null;
    // online betalen via Mollie? enkel de webshop, en enkel als Mollie is ingesteld
    var wantsOnline = (source === 'web' && String(ob.pay_method || '') === 'online' && !!MOLLIE_API_KEY);
    /* Een webbestelling wordt enkel aangenomen als ze online betaald wordt.

       Vroeger kon de webshop ook een bestelling doorsturen die pas bij afhaling
       of levering betaald werd; die kwam meteen op het keukenscherm en in de
       kassa terecht, zonder dat er geld binnen was. De bestelpagina biedt die
       keuze al niet meer aan, maar de server nam ze nog wel aan — bijvoorbeeld
       van een pagina die nog in de browser openstond. Nu wordt ze geweigerd. */
    if (source === 'web' && !wantsOnline) {
      return sendJson(res, 400, {
        error: MOLLIE_API_KEY
          ? 'Online bestellen kan enkel met onmiddellijke betaling. Herlaad de pagina en betaal met kaart of Bancontact.'
          : 'Online bestellen is even niet mogelijk. Bel ons op 03 644 23 31 om te bestellen.'
      });
    }
    var payStatus = wantsOnline ? 'open' : 'later';  // 'open' = wacht op online betaling → nog niet naar de keuken
    var out = db.prepare(
      'INSERT INTO orders (no,created_at,type,tbl,cust_name,cust_phone,cust_email,cust_address,items,subtotal,discount,delivery,total,pay,vat,note,time_wanted,status,source,pay_status,client_key) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(providedNo, now, type, (source === 'pos' ? String(ob.table || '').slice(0, 20) : ''),
      String(cust.name || '').slice(0, 120), String(cust.phone || '').slice(0, 40),
      String(cust.email || '').slice(0, 120), String(cust.address || '').slice(0, 240),
      JSON.stringify(items), subtotal, discount, delivery, total,
      payVal, JSON.stringify(vat),
      String(ob.note || '').slice(0, 300), String(ob.time || '').slice(0, 40), status, source, payStatus, clientKey);
    var oid = Number(out.lastInsertRowid);
    var no = providedNo || ('LM-' + String(oid).padStart(4, '0'));
    if (!providedNo) db.prepare('UPDATE orders SET no=? WHERE id=?').run(no, oid);
    var eta = type === 'leveren' ? '35–50 min' : '20–30 min';

    if (wantsOnline) {
      // Mollie-betaling starten; de bestelling gaat pas naar keuken/kassa als de webhook 'betaald' meldt.
      try {
        var b = baseUrl(req);
        var mp = await mollie('POST', '/payments', {
          amount: { currency: 'EUR', value: total.toFixed(2) },
          description: 'La Mia Pizzeria ' + no,
          redirectUrl: b + '/order.html?betaald=' + oid,
          webhookUrl: b + '/api/mollie/webhook',
          metadata: { orderId: oid, no: no }
        });
        db.prepare('UPDATE orders SET mollie_id=? WHERE id=?').run(String(mp.id || ''), oid);
        var checkout = mp._links && mp._links.checkout && mp._links.checkout.href;
        if (!checkout) throw new Error('geen checkout-url');
        return sendJson(res, 200, { no: no, id: oid, eta: eta, total: total, checkoutUrl: checkout });
      } catch (e) {
        db.prepare('DELETE FROM orders WHERE id=?').run(oid); // niks half laten staan
        return sendJson(res, 502, { error: 'De betaling kon niet gestart worden. Probeer het straks opnieuw, of bel ons op 03 644 23 31 om te bestellen.' });
      }
    }

    // Enkel doorsturen wat ook echt getoond mag worden. Een webbestelling die
    // nog op de betaling wacht, verschijnt pas als Mollie bevestigt dat ze
    // betaald is (zie de webhook hieronder).
    if (!wantsOnline) broadcast('order', orderRow(oid)); // kassabon, of betaald aan de toog
    return sendJson(res, 200, { no: no, id: oid, eta: eta, subtotal: subtotal, discount: discount, delivery: delivery, total: total });
  }

  /* ---------- Mollie webhook: betaalstatus ophalen en de bestelling vrijgeven ---------- */
  if (seg[0] === 'mollie' && seg[1] === 'webhook' && method === 'POST') {
    if (!MOLLIE_API_KEY) return sendJson(res, 200, { ok: true });
    var raw = await readRaw(req);
    var mm = /(?:^|&)id=([^&]+)/.exec(raw || '');
    var pid = mm ? decodeURIComponent(mm[1]) : '';
    if (!pid) return sendJson(res, 200, { ok: true });
    try {
      var pm = await mollie('GET', '/payments/' + encodeURIComponent(pid));
      var moid = pm.metadata && pm.metadata.orderId;
      if (moid) {
        var row = db.prepare('SELECT * FROM orders WHERE id=? AND mollie_id=?').get(Number(moid), pid);
        if (row && row.pay_status !== 'paid') {
          if (pm.status === 'paid') {
            db.prepare("UPDATE orders SET pay_status='paid', pay=? WHERE id=?").run(JSON.stringify({ method: 'online', provider: 'mollie', id: pid }), Number(moid));
            broadcast('order', orderRow(Number(moid))); // nu pas zichtbaar in keuken/kassa
          } else if (pm.status === 'expired' || pm.status === 'canceled' || pm.status === 'failed') {
            db.prepare('UPDATE orders SET pay_status=? WHERE id=?').run(pm.status, Number(moid));
          }
        }
      }
    } catch (e) {}
    return sendJson(res, 200, { ok: true }); // Mollie verwacht altijd 200
  }

  /* ---------- publiek: betaalstatus van een webbestelling (na terugkeer van Mollie) ---------- */
  if (seg[0] === 'order-status' && method === 'GET') {
    var qs = parseQuery(urlPath);
    var orow = db.prepare('SELECT no, pay_status, source FROM orders WHERE id=?').get(Number(qs.id));
    if (!orow || orow.source !== 'web') return sendJson(res, 404, { error: 'niet gevonden' });
    return sendJson(res, 200, { no: orow.no, pay_status: orow.pay_status || 'later' });
  }

  /* ---------- kassa-rol: heeft dit toestel al een geldige koppeling? ----------
     Zo kan de kassa stil opnieuw verbinden zonder telkens naar de PIN te vragen. */
  if (seg[0] === 'pos' && seg[1] === 'session' && method === 'GET') {
    return sendJson(res, 200, { pos: isPos(req) || isAuthed(req) });
  }

  /* ---------- kassa-rol activeren ----------
     Vroeger gaf deze route aan iedereen die erom vroeg een kassa-rol, zonder PIN.
     Daarmee kon elke bezoeker de klantgegevens van lopende bestellingen lezen
     (naam, telefoon, e-mail, adres) en zelf kassabonnen aanmaken die op het
     keukenscherm en in de omzet belandden. De rol zit nu achter de beheer-PIN
     (of POS_PIN als die is ingesteld). Het personeel geeft de PIN één keer per
     toestel in; de koppeling blijft daarna een jaar geldig. */
  if (seg[0] === 'pos' && seg[1] === 'hello' && method === 'POST') {
    // al gekoppeld (of ingelogd als beheer)? dan niets vragen
    if (isPos(req) || isAuthed(req)) return sendJson(res, 200, { ok: true, already: true });
    var lim = pinGuard(req);
    if (lim) return sendJson(res, 429, { error: lim });
    var phb = await readBody(req);
    var posWant = String(process.env.POS_PIN || '') || currentPin();
    if (!pinEquals(String(phb.pin || ''), posWant)) {
      pinFailed(req);
      return sendJson(res, 401, { error: 'Verkeerde PIN' });
    }
    pinOk(req);
    var ptok = sign(JSON.stringify({ role: 'pos', exp: Date.now() + 365 * 24 * 3600e3 }));
    var psec = (req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': 'lamia_pos=' + ptok + '; HttpOnly; SameSite=Lax; Path=/' + psec + '; Max-Age=' + (365 * 24 * 3600) });
  }

  /* ---------- live updates (keukenscherm) ---------- */
  if (seg[0] === 'events' && method === 'GET') {
    if (!isAuthed(req) && !isPos(req)) return sendJson(res, 401, { error: 'Niet ingelogd' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    sseClients.add(res);
    var ping = setInterval(function () { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
    req.on('close', function () { clearInterval(ping); sseClients.delete(res); });
    return; // verbinding blijft open
  }

  /* ---------- sessie ---------- */
  if (seg[0] === 'session' && method === 'GET') {
    return sendJson(res, 200, { authed: isAuthed(req) });
  }
  if (seg[0] === 'login' && method === 'POST') {
    var lgLim = pinGuard(req);
    if (lgLim) return sendJson(res, 429, { error: lgLim });
    var body = await readBody(req);
    if (!pinEquals(String(body.pin || ''), currentPin())) {
      pinFailed(req);
      return sendJson(res, 401, { error: 'Verkeerde PIN' });
    }
    pinOk(req);
    var token = sign(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600e3 }));
    var secure = (req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
    var cookie = 'lamia_sess=' + token + '; HttpOnly; SameSite=Lax; Path=/' + secure + '; Max-Age=' + (SESSION_HOURS * 3600);
    return sendJson(res, 200, { authed: true }, { 'Set-Cookie': cookie });
  }
  if (seg[0] === 'logout' && method === 'POST') {
    return sendJson(res, 200, { authed: false }, { 'Set-Cookie': 'lamia_sess=; HttpOnly; Path=/; Max-Age=0' });
  }

  /* ---------- manager-sessie voor de rapporten (aparte PIN) ---------- */
  if (seg[0] === 'report-login' && method === 'POST') {
    var rpLim = pinGuard(req);
    if (rpLim) return sendJson(res, 429, { error: rpLim });
    var rlb = await readBody(req);
    var given = String(rlb.pin || '');
    var okPin = pinEquals(given, reportPin());
    var envPin = String(process.env.REPORT_PIN || ''); // hoofdsleutel via Railway (noodoplossing bij vergeten PIN)
    if (!okPin && envPin) okPin = pinEquals(given, envPin);
    if (!okPin) { pinFailed(req); return sendJson(res, 401, { error: 'Verkeerde PIN' }); }
    pinOk(req);
    var mtok = sign(JSON.stringify({ role: 'mgr', exp: Date.now() + SESSION_HOURS * 3600e3 }));
    var msec = (req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
    return sendJson(res, 200, { authed: true }, { 'Set-Cookie': 'lamia_mgr=' + mtok + '; HttpOnly; SameSite=Lax; Path=/' + msec + '; Max-Age=' + (SESSION_HOURS * 3600) });
  }
  if (seg[0] === 'report-session' && method === 'GET') {
    return sendJson(res, 200, { authed: isManager(req) });
  }
  if (seg[0] === 'report-logout' && method === 'POST') {
    return sendJson(res, 200, { authed: false }, { 'Set-Cookie': 'lamia_mgr=; HttpOnly; Path=/; Max-Age=0' });
  }
  if (seg[0] === 'report-pin' && method === 'POST') {
    if (!isManager(req)) return sendJson(res, 401, { error: 'Manager-PIN vereist' });
    var rpb = await readBody(req);
    var rnp = String(rpb.pin || '').trim();
    if (!/^[0-9]{4,8}$/.test(rnp)) return sendJson(res, 400, { error: 'PIN moet 4 tot 8 cijfers zijn' });
    db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('report_pin', rnp);
    return sendJson(res, 200, { ok: true });
  }

  /* ---------- beheer (auth vereist) ---------- */
  if (seg[0] === 'admin') {
    var kind = seg[1];        // 'products' | 'categories' | 'pin' | 'report' | 'export'
    var id = seg[2];
    // rapporten & export: aparte manager-PIN (los van de kassa-PIN);
    // de rest van het beheer blijft achter de gewone kassa-sessie.
    if (kind === 'report' || kind === 'export') {
      if (!isManager(req)) return sendJson(res, 401, { error: 'Manager-PIN vereist' });
    } else if (kind === 'orders') {
      // online bestellingen bekijken/afvinken: kassa-rol, beheer-sessie of manager
      // (die laatste is nodig om een bon te annuleren)
      if (!isAuthed(req) && !isPos(req) && !isManager(req)) return sendJson(res, 401, { error: 'Niet toegestaan' });
    } else if (!isAuthed(req)) {
      return sendJson(res, 401, { error: 'Niet ingelogd' });
    }

    if (kind === 'products') {
      if (method === 'GET') return sendJson(res, 200, { products: allProducts() });
      if (method === 'POST') {
        var nb = await readBody(req);
        var err = validProduct(nb);
        if (err) return sendJson(res, 400, { error: err });
        var nid = (nb.id && !db.prepare('SELECT 1 FROM products WHERE id=?').get(nb.id)) ? nb.id : genId(nb.cat);
        var maxSort = db.prepare('SELECT COALESCE(MAX(sort),0)+1 AS s FROM products').get().s;
        db.prepare('INSERT INTO products (id,cat,type,name,descr,price,sizes,tag,available,sort,img,color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(nid, nb.cat, nb.type || 'simple', nb.name.trim(), nb.descr || '', parseFloat(nb.price),
               (nb.sizes && nb.sizes.length) ? JSON.stringify(nb.sizes) : null, nb.tag || '',
               nb.available === false ? 0 : 1, maxSort, nb.img || imgForCat(nb.cat), optColor(nb.color));
        return sendJson(res, 200, { product: rowToProduct(db.prepare('SELECT * FROM products WHERE id=?').get(nid)) });
      }
      if (method === 'PUT' && id) {
        var ub = await readBody(req);
        if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(id)) return sendJson(res, 404, { error: 'Niet gevonden' });
        var e2 = validProduct(ub);
        if (e2) return sendJson(res, 400, { error: e2 });
        db.prepare('UPDATE products SET cat=?,type=?,name=?,descr=?,price=?,sizes=?,tag=?,available=?,img=?,color=? WHERE id=?')
          .run(ub.cat, ub.type || 'simple', ub.name.trim(), ub.descr || '', parseFloat(ub.price),
               (ub.sizes && ub.sizes.length) ? JSON.stringify(ub.sizes) : null, ub.tag || '',
               ub.available === false ? 0 : 1, ub.img || imgForCat(ub.cat), optColor(ub.color), id);
        return sendJson(res, 200, { product: rowToProduct(db.prepare('SELECT * FROM products WHERE id=?').get(id)) });
      }
      if (method === 'DELETE' && id) {
        db.prepare('DELETE FROM products WHERE id=?').run(id);
        return sendJson(res, 200, { ok: true });
      }
    }

    if (kind === 'categories') {
      if (method === 'GET') return sendJson(res, 200, { categories: allCategories() });
      if (method === 'POST') {
        var cb = await readBody(req);
        if (!cb.id || !/^[a-z0-9_-]+$/.test(cb.id)) return sendJson(res, 400, { error: 'Ongeldige id (a-z, 0-9)' });
        if (!cb.label) return sendJson(res, 400, { error: 'Label verplicht' });
        if (db.prepare('SELECT 1 FROM categories WHERE id=?').get(cb.id)) return sendJson(res, 400, { error: 'Bestaat al' });
        var ms = db.prepare('SELECT COALESCE(MAX(sort),0)+1 AS s FROM categories').get().s;
        db.prepare('INSERT INTO categories (id,label,color,kind,sort) VALUES (?,?,?,?,?)')
          .run(cb.id, String(cb.label).slice(0, 40), hexColor(cb.color), cb.kind === 'drink' ? 'drink' : 'food', ms);
        return sendJson(res, 200, { category: db.prepare('SELECT * FROM categories WHERE id=?').get(cb.id) });
      }
      if (method === 'PUT' && id) {
        var cu = await readBody(req);
        if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(id)) return sendJson(res, 404, { error: 'Niet gevonden' });
        db.prepare('UPDATE categories SET label=?,color=?,kind=? WHERE id=?')
          .run(String(cu.label || '').slice(0, 40), hexColor(cu.color), cu.kind === 'drink' ? 'drink' : 'food', id);
        return sendJson(res, 200, { category: db.prepare('SELECT * FROM categories WHERE id=?').get(id) });
      }
      if (method === 'DELETE' && id) {
        var used = db.prepare('SELECT COUNT(*) AS n FROM products WHERE cat=?').get(id).n;
        if (used > 0) return sendJson(res, 400, { error: 'Categorie bevat nog ' + used + ' product(en)' });
        db.prepare('DELETE FROM categories WHERE id=?').run(id);
        return sendJson(res, 200, { ok: true });
      }
    }

    if (kind === 'orders') {
      if (method === 'GET') {
        var activeOnly = urlPath.indexOf('active=1') >= 0;
        var sql = activeOnly
          // Een webbestelling verschijnt enkel als ze betaald is. Kassabonnen
          // (source 'pos') zijn aan de toog betaald en komen altijd door.
          // Een geannuleerde bon hoort niet meer op het keukenbord: ze wordt niet
          // gemaakt en telt niet mee in de omzet.
          ? "SELECT * FROM orders WHERE status NOT IN ('afgehaald','geannuleerd') AND voided_at IS NULL AND (source != 'web' OR pay_status = 'paid') ORDER BY id ASC LIMIT 200"
          : "SELECT * FROM orders WHERE (source != 'web' OR pay_status = 'paid') ORDER BY id DESC LIMIT 200";
        var rows = db.prepare(sql).all().map(function (o) {
          o.items = o.items ? JSON.parse(o.items) : [];
          o.pay = o.pay ? JSON.parse(o.pay) : null;
          return o;
        });
        return sendJson(res, 200, { orders: rows });
      }
      if (method === 'PATCH' && id) {
        var stb = await readBody(req);
        var st = ['nieuw', 'bereiden', 'klaar', 'afgehaald'].indexOf(stb.status) >= 0 ? stb.status : 'nieuw';
        db.prepare('UPDATE orders SET status=? WHERE id=?').run(st, id);
        broadcast('status', { id: Number(id), status: st }); // live naar het keukenscherm
        return sendJson(res, 200, { ok: true });
      }
      /* Een afgerekende bon annuleren.

         Sloeg iemand een bon verkeerd aan, dan stond die fout tot nu toe voorgoed
         in de omzet en de BTW-aangifte. De bon wordt niet verwijderd — ze blijft
         staan met het tijdstip en de reden — maar telt niet meer mee. Dat hoort
         zo: een kassaverkoop laten verdwijnen is geen boekhouding.

         Annuleren vraagt de manager-PIN; het is geen handeling voor aan de toog. */
      if (method === 'POST' && id === 'annuleer') {
        if (!isManager(req)) return sendJson(res, 401, { error: 'Manager-PIN vereist' });
        var vb = await readBody(req);
        var bonNo = String(vb.no || '').slice(0, 20);
        if (!bonNo) return sendJson(res, 400, { error: 'Geen bonnummer' });
        var ord = db.prepare('SELECT id,no,total,status,voided_at FROM orders WHERE no=?').get(bonNo);
        if (!ord) return sendJson(res, 404, { error: 'Bon niet gevonden' });
        if (ord.voided_at) return sendJson(res, 200, { ok: true, no: ord.no, al: true });
        db.prepare("UPDATE orders SET status='geannuleerd', voided_at=?, void_reason=? WHERE id=?")
          .run(new Date().toISOString(), String(vb.reason || '').slice(0, 200), ord.id);
        broadcast('status', { id: ord.id, status: 'geannuleerd' });   // van het keukenscherm halen
        return sendJson(res, 200, { ok: true, no: ord.no, total: ord.total });
      }
    }

    if (kind === 'report' && method === 'GET') {
      var q = parseQuery(urlPath);
      var from = q.from || '0000', to = q.to || '9999';
      var rows = db.prepare('SELECT * FROM orders WHERE created_at >= ? AND created_at < ? ORDER BY id').all(from, to);
      var rep = {
        count: 0, revenue: 0, discount: 0, delivery: 0,
        byPay: { cash: 0, card: 0, online: 0, onbetaald: 0 },
        bySource: { web: 0, pos: 0 },
        byType: { afhalen: 0, leveren: 0, terplaatse: 0 },
        byCat: {}, vat: {}, byDay: {}, byWeek: {},
        // per artikel: hoeveel stuks en hoeveel omzet over de hele periode,
        // plus per dag het aantal stuks — zodat de zaakvoerder van op afstand
        // kan volgen wat er verkoopt en hoe dat van dag tot dag beweegt.
        byItem: {}, byItemDay: {},
        geannuleerd: { count: 0, amount: 0 }
      };
      rows.forEach(function (o) {
        if (o.pay_status === 'open' || o.pay_status === 'expired' || o.pay_status === 'canceled' || o.pay_status === 'failed') return; // niet-betaalde online bestellingen tellen niet mee
        // geannuleerde bonnen tellen niet mee in de omzet, maar blijven wel zichtbaar
        if (o.voided_at) { rep.geannuleerd.count++; rep.geannuleerd.amount += o.total || 0; return; }
        rep.count++; rep.revenue += o.total || 0; rep.discount += o.discount || 0; rep.delivery += o.delivery || 0;
        rep.bySource[o.source] = (rep.bySource[o.source] || 0) + (o.total || 0);
        rep.byType[o.type] = (rep.byType[o.type] || 0) + (o.total || 0);
        // betaalwijze uitsplitsen (één keer berekenen, toepassen op totaal én per dag)
        var pay = o.pay ? JSON.parse(o.pay) : null;
        var cAmt = 0, kAmt = 0, oAmt = 0, uAmt = 0;
        if (!pay) uAmt = o.total || 0;
        else if (pay.method === 'split') { cAmt = pay.cash || 0; kAmt = pay.card || 0; }
        else if (pay.method === 'card') kAmt = o.total || 0;
        else if (pay.method === 'online') oAmt = o.total || 0; // online via de website (Mollie)
        else cAmt = o.total || 0;
        rep.byPay.cash += cAmt; rep.byPay.card += kAmt; rep.byPay.online += oAmt; rep.byPay.onbetaald += uAmt;
        // per dag
        var day = belgiumDate(o.created_at);
        var bd = rep.byDay[day] || (rep.byDay[day] = { revenue: 0, count: 0, cash: 0, card: 0, online: 0, onbetaald: 0 });
        bd.revenue += o.total || 0; bd.count++; bd.cash += cAmt; bd.card += kAmt; bd.online += oAmt; bd.onbetaald += uAmt;
        // per week (op de maandag van die week)
        var wk = weekMonday(day);
        var bw = rep.byWeek[wk] || (rep.byWeek[wk] = { revenue: 0, count: 0, cash: 0, card: 0, online: 0, onbetaald: 0 });
        bw.revenue += o.total || 0; bw.count++; bw.cash += cAmt; bw.card += kAmt; bw.online += oAmt; bw.onbetaald += uAmt;
        var vat = o.vat ? JSON.parse(o.vat) : {};
        Object.keys(vat).forEach(function (r) { rep.vat[r] = (rep.vat[r] || 0) + vat[r]; });
        (o.items ? JSON.parse(o.items) : []).forEach(function (it) {
          var c = it.cat || 'onbekend'; rep.byCat[c] = (rep.byCat[c] || 0) + (it.unit * it.qty);
          // per artikel optellen; de naam is wat er op de bon stond
          var naam = String(it.name || 'onbekend');
          var qty = Number(it.qty) || 0, bedrag = (Number(it.unit) || 0) * qty;
          var bi = rep.byItem[naam] || (rep.byItem[naam] = { qty: 0, revenue: 0, cat: c });
          bi.qty += qty; bi.revenue += bedrag;
          var bid = rep.byItemDay[naam] || (rep.byItemDay[naam] = {});
          bid[day] = (bid[day] || 0) + qty;
        });
      });
      function r2(x) { return Math.round(x * 100) / 100; }
      rep.revenue = r2(rep.revenue); rep.discount = r2(rep.discount); rep.delivery = r2(rep.delivery);
      ['byPay', 'bySource', 'byType', 'byCat', 'vat'].forEach(function (g) {
        Object.keys(rep[g]).forEach(function (k) { rep[g][k] = r2(rep[g][k]); });
      });
      Object.keys(rep.byDay).forEach(function (day) {
        Object.keys(rep.byDay[day]).forEach(function (k) { if (k !== 'count') rep.byDay[day][k] = r2(rep.byDay[day][k]); });
      });
      Object.keys(rep.byWeek).forEach(function (wk) {
        Object.keys(rep.byWeek[wk]).forEach(function (k) { if (k !== 'count') rep.byWeek[wk][k] = r2(rep.byWeek[wk][k]); });
      });
      Object.keys(rep.byItem).forEach(function (naam) { rep.byItem[naam].revenue = r2(rep.byItem[naam].revenue); });
      rep.geannuleerd.amount = r2(rep.geannuleerd.amount);
      // labels voor categorieën
      var catLabels = {};
      allCategories().forEach(function (c) { catLabels[c.id] = c.label; });
      return sendJson(res, 200, { report: rep, from: from, to: to, catLabels: catLabels });
    }

    if (kind === 'export' && method === 'GET') {
      var eq = parseQuery(urlPath);
      var erows = db.prepare('SELECT * FROM orders WHERE created_at >= ? AND created_at < ? ORDER BY id').all(eq.from || '0000', eq.to || '9999');
      var out = ['nummer;datum;bron;type;tafel;klant;subtotaal;korting;levering;totaal;btw6;btw12;btw21;betaalwijze'];
      erows.forEach(function (o) {
        if (o.pay_status === 'open' || o.pay_status === 'expired' || o.pay_status === 'canceled' || o.pay_status === 'failed') return; // niet-betaalde online bestellingen niet exporteren
        if (o.voided_at) return;   // geannuleerde bonnen horen niet in de boekhoudexport
        var v = o.vat ? JSON.parse(o.vat) : {}, pay = o.pay ? JSON.parse(o.pay) : null;
        out.push([o.no, o.created_at, o.source, o.type, o.tbl || '', o.cust_name || '',
          o.subtotal || 0, o.discount || 0, o.delivery || 0, o.total || 0,
          v['6'] || 0, v['12'] || 0, v['21'] || 0, pay ? pay.method : 'onbetaald'].map(csvCell).join(';'));
      });
      var csv = '﻿' + out.join('\r\n');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="lamia-rapport.csv"', 'Cache-Control': 'no-store' });
      return res.end(csv);
    }

    if (kind === 'pin' && method === 'POST') {
      var pb = await readBody(req);
      var np = String(pb.pin || '');
      if (!/^\d{4,8}$/.test(np)) return sendJson(res, 400, { error: 'PIN moet 4–8 cijfers zijn' });
      db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('admin_pin', np);
      return sendJson(res, 200, { ok: true });
    }
  }

  sendJson(res, 404, { error: 'Onbekende route' });
}

/* ============================================================================
   SERVER
   ========================================================================== */
var server = http.createServer(function (req, res) {
  var urlPath = req.url || '/';
  if (urlPath.indexOf('/api/') === 0 || urlPath === '/api') {
    handleApi(req, res, urlPath).catch(function (e) {
      console.error(e);
      sendJson(res, 500, { error: 'Serverfout' });
    });
    return;
  }
  var plain = urlPath.split('?')[0];
  if (plain === '/robots.txt') return sendCompressed(req, res, 200, Buffer.from(robotsTxt(), 'utf8'), { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  if (plain === '/sitemap.xml') return sendCompressed(req, res, 200, Buffer.from(sitemapXml(), 'utf8'), { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  serveStatic(req, res, urlPath);
});

server.listen(PORT, function () {
  console.log('La Mia Pizzeria — systeem draait');
  // De beheer-PIN stond hier vroeger voluit in. Op Railway staan die logs in het
  // dashboard, dus die PIN wordt enkel nog getoond wanneer je lokaal draait.
  var lokaal = !process.env.RAILWAY_ENVIRONMENT && process.env.NODE_ENV !== 'production';
  console.log('  ↳ open http://localhost:' + PORT + '/beheer.html   (beheer' + (lokaal ? ', PIN ' + currentPin() : '') + ')');
  console.log('  ↳ site   http://localhost:' + PORT + '/');
});

module.exports = server;
