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
  '  sort INTEGER DEFAULT 0' +
  ');'
);
db.exec(
  'CREATE TABLE IF NOT EXISTS settings (' +
  '  key TEXT PRIMARY KEY,' +
  '  value TEXT' +
  ');'
);

/* ---- eerste keer: vul de database met de canonieke kaart ---- */
function seedIfEmpty() {
  var count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (count > 0) return;
  var insCat = db.prepare('INSERT INTO categories (id,label,color,kind,sort) VALUES (?,?,?,?,?)');
  catalogue.CATEGORIES.forEach(function (c) {
    insCat.run(c.id, c.label, c.color || null, c.kind || 'food', c.sort || 0);
  });
  var insProd = db.prepare(
    'INSERT INTO products (id,cat,type,name,descr,price,sizes,tag,available,sort) VALUES (?,?,?,?,?,?,?,?,?,?)'
  );
  catalogue.PRODUCTS.forEach(function (p, i) {
    insProd.run(
      p.id, p.c, p.t || 'simple', p.name, p.desc || '', p.price,
      p.sz ? JSON.stringify(p.sz) : null, p.tag || '', 1, i
    );
  });
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('admin_pin', ADMIN_PIN);
  console.log('  ↳ database gevuld met ' + catalogue.PRODUCTS.length + ' producten in ' + catalogue.CATEGORIES.length + ' categorieën');
}
seedIfEmpty();

function currentPin() {
  var row = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_pin');
  return row ? String(row.value) : ADMIN_PIN;
}

/* ---- rij → net JSON object ---- */
function rowToProduct(r) {
  return {
    id: r.id, cat: r.cat, type: r.type, name: r.name, descr: r.descr,
    price: r.price, sizes: r.sizes ? JSON.parse(r.sizes) : null,
    tag: r.tag || '', available: !!r.available, sort: r.sort
  };
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

var MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff'
};
function serveStatic(req, res, urlPath) {
  var rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  var safe = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
  var file = path.join(ROOT, safe);
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); return res.end('Verboden'); }
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Niet gevonden'); }
    var ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
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
    return sendJson(res, 200, { categories: cats, products: prods });
  }

  /* ---------- sessie ---------- */
  if (seg[0] === 'session' && method === 'GET') {
    return sendJson(res, 200, { authed: isAuthed(req) });
  }
  if (seg[0] === 'login' && method === 'POST') {
    var body = await readBody(req);
    if (String(body.pin || '') !== currentPin()) return sendJson(res, 401, { error: 'Verkeerde PIN' });
    var token = sign(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600e3 }));
    var cookie = 'lamia_sess=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + (SESSION_HOURS * 3600);
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
        db.prepare('INSERT INTO products (id,cat,type,name,descr,price,sizes,tag,available,sort) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .run(nid, nb.cat, nb.type || 'simple', nb.name.trim(), nb.descr || '', parseFloat(nb.price),
               (nb.sizes && nb.sizes.length) ? JSON.stringify(nb.sizes) : null, nb.tag || '',
               nb.available === false ? 0 : 1, maxSort);
        return sendJson(res, 200, { product: rowToProduct(db.prepare('SELECT * FROM products WHERE id=?').get(nid)) });
      }
      if (method === 'PUT' && id) {
        var ub = await readBody(req);
        if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(id)) return sendJson(res, 404, { error: 'Niet gevonden' });
        var e2 = validProduct(ub);
        if (e2) return sendJson(res, 400, { error: e2 });
        db.prepare('UPDATE products SET cat=?,type=?,name=?,descr=?,price=?,sizes=?,tag=?,available=? WHERE id=?')
          .run(ub.cat, ub.type || 'simple', ub.name.trim(), ub.descr || '', parseFloat(ub.price),
               (ub.sizes && ub.sizes.length) ? JSON.stringify(ub.sizes) : null, ub.tag || '',
               ub.available === false ? 0 : 1, id);
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
          .run(cb.id, cb.label, cb.color || '#e6b24c', cb.kind === 'drink' ? 'drink' : 'food', ms);
        return sendJson(res, 200, { category: db.prepare('SELECT * FROM categories WHERE id=?').get(cb.id) });
      }
      if (method === 'PUT' && id) {
        var cu = await readBody(req);
        if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(id)) return sendJson(res, 404, { error: 'Niet gevonden' });
        db.prepare('UPDATE categories SET label=?,color=?,kind=? WHERE id=?')
          .run(cu.label, cu.color || '#e6b24c', cu.kind === 'drink' ? 'drink' : 'food', id);
        return sendJson(res, 200, { category: db.prepare('SELECT * FROM categories WHERE id=?').get(id) });
      }
      if (method === 'DELETE' && id) {
        var used = db.prepare('SELECT COUNT(*) AS n FROM products WHERE cat=?').get(id).n;
        if (used > 0) return sendJson(res, 400, { error: 'Categorie bevat nog ' + used + ' product(en)' });
        db.prepare('DELETE FROM categories WHERE id=?').run(id);
        return sendJson(res, 200, { ok: true });
      }
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
