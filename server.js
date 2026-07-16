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
var fs = require('node:fs');
var path = require('node:path');
var crypto = require('node:crypto');
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
  '.woff2': 'font/woff2', '.woff': 'font/woff'
};
// Enkel deze extensies zijn publiek serveerbaar (blokkeert .db, .key, .json, .md, Dockerfile, …)
var SERVE_EXT = { '.html': 1, '.js': 1, '.css': 1, '.png': 1, '.jpg': 1, '.jpeg': 1, '.svg': 1, '.ico': 1, '.webp': 1, '.woff': 1, '.woff2': 1 };
// Deze mappen bevatten interne bestanden en worden nooit geserveerd
var BLOCK_DIR = { data: 1, lib: 1, node_modules: 1, '.git': 1 };
function serveStatic(req, res, urlPath) {
  var rel;
  try { rel = decodeURIComponent(urlPath.split('?')[0]); }
  catch (e) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Ongeldige URL'); }
  if (rel === '/' || rel === '') rel = '/index.html';
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
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
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
    return sendJson(res, 200, { categories: cats, products: prods, config: { deliveryFee: DELIVERY_FEE, minOrder: MIN_ORDER } });
  }

  /* ---------- publiek: bestelling plaatsen (webshop) ---------- */
  if (seg[0] === 'orders' && method === 'POST') {
    var ob = await readBody(req);
    var rawItems = Array.isArray(ob.items) ? ob.items : [];
    if (!rawItems.length) return sendJson(res, 400, { error: 'Lege bestelling' });
    var type = ['afhalen', 'leveren', 'terplaatse'].indexOf(ob.type) >= 0 ? ob.type : 'afhalen';
    // Alleen een ingelogde kassa mag een POS-bon (met betaalinfo/eigen nummer) plaatsen.
    // De publieke webshop kan enkel gewone webbestellingen aanmaken.
    var source = (isAuthed(req) && ob.source === 'pos') ? 'pos' : 'web';
    var subtotal = 0;
    var priceError = null;
    var items = rawItems.slice(0, 100).map(function (it) {
      var qty = Math.max(1, parseInt(it.qty, 10) || 1);
      var unit = Math.max(0, parseFloat(it.unit) || 0);
      var name = String(it.name || '').slice(0, 120);
      var prod = db.prepare('SELECT cat, price, sizes FROM products WHERE name=?').get(name);
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
    subtotal = Math.round(subtotal * 100) / 100;
    // korting en betaalinfo enkel voor de (ingelogde) kassa
    var discount = (source === 'pos') ? Math.round(Math.max(0, Math.min(parseFloat(ob.discount) || 0, subtotal)) * 100) / 100 : (type === 'leveren' ? Math.round(subtotal * 0.30 * 100) / 100 : 0);
    var delivery = type === 'leveren' ? DELIVERY_FEE : 0;
    var total = Math.round((subtotal - discount + delivery) * 100) / 100;
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
    var payVal = (source === 'pos' && ob.pay) ? JSON.stringify(ob.pay) : null;
    var out = db.prepare(
      'INSERT INTO orders (no,created_at,type,tbl,cust_name,cust_phone,cust_email,cust_address,items,subtotal,discount,delivery,total,pay,vat,note,time_wanted,status,source) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(providedNo, now, type, (source === 'pos' ? String(ob.table || '').slice(0, 20) : ''),
      String(cust.name || '').slice(0, 120), String(cust.phone || '').slice(0, 40),
      String(cust.email || '').slice(0, 120), String(cust.address || '').slice(0, 240),
      JSON.stringify(items), subtotal, discount, delivery, total,
      payVal, JSON.stringify(vat),
      String(ob.note || '').slice(0, 300), String(ob.time || '').slice(0, 40), status, source);
    var oid = Number(out.lastInsertRowid);
    var no = providedNo || ('LM-' + String(oid).padStart(4, '0'));
    if (!providedNo) db.prepare('UPDATE orders SET no=? WHERE id=?').run(no, oid);
    broadcast('order', orderRow(oid)); // live naar het keukenscherm
    var eta = type === 'leveren' ? '35–50 min' : '20–30 min';
    return sendJson(res, 200, { no: no, id: oid, eta: eta, subtotal: subtotal, discount: discount, delivery: delivery, total: total });
  }

  /* ---------- live updates (keukenscherm) ---------- */
  if (seg[0] === 'events' && method === 'GET') {
    if (!isAuthed(req)) return sendJson(res, 401, { error: 'Niet ingelogd' });
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
    var body = await readBody(req);
    var given = crypto.createHash('sha256').update(String(body.pin || '')).digest();
    var want = crypto.createHash('sha256').update(currentPin()).digest();
    if (!crypto.timingSafeEqual(given, want)) return sendJson(res, 401, { error: 'Verkeerde PIN' });
    var token = sign(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600e3 }));
    var secure = (req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
    var cookie = 'lamia_sess=' + token + '; HttpOnly; SameSite=Lax; Path=/' + secure + '; Max-Age=' + (SESSION_HOURS * 3600);
    return sendJson(res, 200, { authed: true }, { 'Set-Cookie': cookie });
  }
  if (seg[0] === 'logout' && method === 'POST') {
    return sendJson(res, 200, { authed: false }, { 'Set-Cookie': 'lamia_sess=; HttpOnly; Path=/; Max-Age=0' });
  }

  /* ---------- beheer (auth vereist) ---------- */
  if (seg[0] === 'admin') {
    if (!isAuthed(req)) return sendJson(res, 401, { error: 'Niet ingelogd' });
    var kind = seg[1];        // 'products' | 'categories' | 'pin'
    var id = seg[2];

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
          ? "SELECT * FROM orders WHERE status != 'afgehaald' ORDER BY id ASC LIMIT 200"
          : 'SELECT * FROM orders ORDER BY id DESC LIMIT 200';
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
    }

    if (kind === 'report' && method === 'GET') {
      var q = parseQuery(urlPath);
      var from = q.from || '0000', to = q.to || '9999';
      var rows = db.prepare('SELECT * FROM orders WHERE created_at >= ? AND created_at < ? ORDER BY id').all(from, to);
      var rep = {
        count: 0, revenue: 0, discount: 0, delivery: 0,
        byPay: { cash: 0, card: 0, onbetaald: 0 },
        bySource: { web: 0, pos: 0 },
        byType: { afhalen: 0, leveren: 0, terplaatse: 0 },
        byCat: {}, vat: {}
      };
      rows.forEach(function (o) {
        rep.count++; rep.revenue += o.total || 0; rep.discount += o.discount || 0; rep.delivery += o.delivery || 0;
        rep.bySource[o.source] = (rep.bySource[o.source] || 0) + (o.total || 0);
        rep.byType[o.type] = (rep.byType[o.type] || 0) + (o.total || 0);
        var pay = o.pay ? JSON.parse(o.pay) : null;
        if (!pay) rep.byPay.onbetaald += o.total || 0;
        else if (pay.method === 'split') { rep.byPay.cash += pay.cash || 0; rep.byPay.card += pay.card || 0; }
        else if (pay.method === 'card') rep.byPay.card += o.total || 0;
        else rep.byPay.cash += o.total || 0;
        var vat = o.vat ? JSON.parse(o.vat) : {};
        Object.keys(vat).forEach(function (r) { rep.vat[r] = (rep.vat[r] || 0) + vat[r]; });
        (o.items ? JSON.parse(o.items) : []).forEach(function (it) {
          var c = it.cat || 'onbekend'; rep.byCat[c] = (rep.byCat[c] || 0) + (it.unit * it.qty);
        });
      });
      function r2(x) { return Math.round(x * 100) / 100; }
      rep.revenue = r2(rep.revenue); rep.discount = r2(rep.discount); rep.delivery = r2(rep.delivery);
      ['byPay', 'bySource', 'byType', 'byCat', 'vat'].forEach(function (g) {
        Object.keys(rep[g]).forEach(function (k) { rep[g][k] = r2(rep[g][k]); });
      });
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
  serveStatic(req, res, urlPath);
});

server.listen(PORT, function () {
  console.log('La Mia Pizzeria — systeem draait');
  console.log('  ↳ open http://localhost:' + PORT + '/beheer.html   (beheer, PIN ' + currentPin() + ')');
  console.log('  ↳ site   http://localhost:' + PORT + '/');
});

module.exports = server;
