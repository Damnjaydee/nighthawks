// server.js — Nighthawks (static + concierge + membership + auth + uploads)
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
let Database; try { Database = require('better-sqlite3'); } catch (_) {}

const app = express();

/* ========== env helpers ========== */
const env = (k, d='') => (process.env[k] ?? d);
const asInt = (v, d) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
};
const asBool = (v, d=false) => (v == null ? d : /^(1|true|yes|on)$/i.test(String(v).trim()));
const splitCSV = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);

/* ========== config ========== */
const PUBLIC_URL          = env('PUBLIC_URL', 'http://localhost:5009');
const PORT                = asInt(env('PORT', 5009), 5009);
const TRUST_PROXY         = asInt(env('TRUST_PROXY', 1), 1);
const COOKIE_SECURE       = asBool(env('COOKIE_SECURE', '0'), false);
const SESSION_SECRET      = env('SESSION_SECRET', 'change-me');
const SESSION_COOKIE_NAME = env('SESSION_COOKIE_NAME', 'nighthawks.sid');
const SESSION_TTL_SECONDS = asInt(env('SESSION_TTL_SECONDS', 60*60*8), 60*60*8);
const LOG_LEVEL           = env('LOG_LEVEL', 'info');

const CORS_ORIGINS = new Set(
  splitCSV(env('CORS_ORIGINS',
    [PUBLIC_URL, 'http://localhost:5500', 'http://127.0.0.1:5500'].join(',')
  ))
);

const WINDOW_MIN  = asInt(env('RATE_LIMIT_WINDOW_MIN', 15), 15);
const RL_MAX      = asInt(env('RATE_LIMIT_MAX', 100), 100);
const RL_AUTH_MAX = asInt(env('AUTH_RATE_LIMIT_MAX', 50), 50);

const SQLITE_DB_PATH = env('SQLITE_DB_PATH', path.join(process.cwd(), 'db', 'requests.db'));

/* admin */
const ADMIN_EMAIL = (env('ADMIN_EMAIL', '') || '').trim().toLowerCase();
const ADMIN_HASH  = env('ADMIN_PASSWORD_HASH', ''); // bcrypt hash

/* flags */
const PUBLIC_REQUESTS_ENABLED = asBool(env('PUBLIC_REQUESTS_ENABLED', '1'), true);

/* email */
const SMTP_HOST  = env('SMTP_HOST', '');
const SMTP_PORT  = asInt(env('SMTP_PORT', 587), 587);
const SMTP_SECURE= asBool(env('SMTP_SECURE', 'false'), false);
const SMTP_USER  = env('SMTP_USER', '');
const SMTP_PASS  = env('SMTP_PASS', '');
const EMAIL_FROM = env('EMAIL_FROM', 'Nighthawks <no-reply@nhconcerige.com>');
const EMAIL_TO   = env('EMAIL_TO',   'concierge@nhconcerige.com>');

/* ========== security & parsers ========== */
app.set('trust proxy', TRUST_PROXY);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
}));

// CORS only for /api
const corsCheck = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);        // same-origin / curl
    if (CORS_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'), false);
  },
  credentials: false
});
app.use('/api', corsCheck);
app.options('/api/*', corsCheck);

app.use(cookieParser());
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

// Sessions (SQLite store so you don't get the MemoryStore warning)
const SESSION_DB_DIR = path.join(__dirname, 'db');
fs.mkdirSync(SESSION_DB_DIR, { recursive: true });
app.use(session({
  store: new SQLiteStore({ dir: SESSION_DB_DIR, db: 'sessions.sqlite' }),
  name: SESSION_COOKIE_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    maxAge: SESSION_TTL_SECONDS * 1000
  }
}));

/* ========== rate limits ========== */
const windowMs = WINDOW_MIN * 60 * 1000;
app.use(['/api', '/api/*'], rateLimit({ windowMs, limit: RL_MAX }));
app.use(['/api/auth', '/api/auth/*'], rateLimit({ windowMs, limit: RL_AUTH_MAX }));

/* ========== misc ========== */
app.get('/robots.txt', (_req,res)=>res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

/* ========== static ========== */
app.use(express.static(__dirname, { extensions: ['html'] }));

/* ========== storage bootstrap ========== */
fs.mkdirSync(path.dirname(SQLITE_DB_PATH), { recursive: true });
let db = null, transporter = null;

if (Database) {
  db = new Database(SQLITE_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS concierge_requests (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at    TEXT DEFAULT (datetime('now')),
      full_name     TEXT NOT NULL,
      email         TEXT NOT NULL,
      phone         TEXT,
      type          TEXT NOT NULL,
      date_pref     TEXT,
      time_pref     TEXT,
      party_size    TEXT,
      neighborhood  TEXT,
      budget        TEXT,
      details       TEXT,
      ip            TEXT
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS membership_applications (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at    TEXT DEFAULT (datetime('now')),
      full_name     TEXT NOT NULL,
      dob           TEXT NOT NULL,
      email         TEXT NOT NULL,
      phone         TEXT NOT NULL,
      address       TEXT NOT NULL,
      city          TEXT NOT NULL,
      state         TEXT NOT NULL,
      country       TEXT NOT NULL,
      company       TEXT NOT NULL,
      industry      TEXT NOT NULL,
      role          TEXT NOT NULL,
      bio           TEXT NOT NULL,
      socials       TEXT,
      headshot_key  TEXT
    );
  `);
}

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

/* ========== helpers ========== */
const escapeHtml = (s='') => String(s)
  .replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
const trimMax = (v,n) => String(v ?? '').trim().slice(0,n);

/* ========== concierge request API ========== */
const insertReq = db ? db.prepare(`
  INSERT INTO concierge_requests
    (full_name,email,phone,type,date_pref,time_pref,party_size,neighborhood,budget,details,ip)
  VALUES
    (@full_name,@email,@phone,@type,@date_pref,@time_pref,@party_size,@neighborhood,@budget,@details,@ip)
`) : null;

async function handleConcierge(req, res) {
  try {
    if (!PUBLIC_REQUESTS_ENABLED) return res.status(404).json({ ok:false });
    if (!insertReq) return res.status(500).json({ ok:false, error:'Storage not initialized.' });

    const r = req.body || {};
    if (!r.fullName || !r.email || !r.typeOfRequest)
      return res.status(400).json({ ok:false, error:'Missing required fields.' });
    if (!isEmail(r.email))
      return res.status(400).json({ ok:false, error:'Invalid email.' });

    const row = {
      full_name:    trimMax(r.fullName,200),
      email:        trimMax(r.email,320),
      phone:        trimMax(String(r.phone||'').replace(/[^\d+]/g,''),32),
      type:         trimMax(r.typeOfRequest,200),
      date_pref:    trimMax(r.date,40),
      time_pref:    trimMax(r.time,40),
      party_size:   trimMax(String(r.partySize||''),40),
      neighborhood: trimMax(r.neighborhood,200),
      budget:       trimMax(r.budget,200),
      details:      trimMax(r.details,5000),
      ip:           trimMax((req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || ''),64)
    };

    const info = insertReq.run(row);
    const id = info.lastInsertRowid;

    if (transporter) {
      const html = `
        <div style="font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#111">
          <h2 style="margin:0 0 8px">New Concierge Request</h2>
          <p style="margin:0 0 10px;color:#444">#${id} • ${new Date().toLocaleString()}</p>
          <p><b>${escapeHtml(row.full_name)}</b> — ${escapeHtml(row.email)} — ${escapeHtml(row.phone)}</p>
          <p><b>Type:</b> ${escapeHtml(row.type)}</p>
          <p><b>Date/Time:</b> ${escapeHtml(row.date_pref)} ${escapeHtml(row.time_pref)}</p>
          <p><b>Party:</b> ${escapeHtml(row.party_size)} • <b>Area:</b> ${escapeHtml(row.neighborhood)} • <b>Budget:</b> ${escapeHtml(row.budget)}</p>
          <pre style="white-space:pre-wrap;margin:12px 0 0">${escapeHtml(row.details)}</pre>
        </div>`;
      await transporter.sendMail({ to:EMAIL_TO, from:EMAIL_FROM, subject:`New Concierge Request #${id}`, html });
    }

    return res.json({ ok:true, id });
  } catch (e) {
    console.error('POST /api/request error:', e);
    return res.status(500).json({ ok:false, error:'Server error.' });
  }
}
app.post('/api/request', handleConcierge);   // singular
app.post('/api/requests', handleConcierge);  // also accept plural (matches your earlier HTML)

/* ========== uploads (local disk) ========== */
const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.post('/api/uploads/presign', (req, res) => {
  try {
    const { fileName='file', folder='headshots' } = req.body || {};
    const safeName = String(fileName).replace(/[^\w.\-]+/g,'_').slice(-120);
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safeName}`;
    const uploadUrl = `/api/uploads/direct/${encodeURIComponent(key)}`;
    return res.json({ ok:true, uploadUrl, key });
  } catch {
    return res.status(500).json({ ok:false, error:'presign-failed' });
  }
});

app.put('/api/uploads/direct/:key(*)',
  express.raw({ type:'*/*', limit:'10mb' }),
  async (req, res) => {
    try {
      const key = String(req.params.key || '');
      if (!key || key.includes('..')) return res.status(400).end();
      const target = path.join(UPLOADS_DIR, key);
      await fsp.mkdir(path.dirname(target), { recursive:true });
      await fsp.writeFile(target, req.body);
      res.status(200).end();
    } catch (e) {
      console.error('upload error:', e);
      res.status(500).end();
    }
  }
);

// public files
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge:'1y', immutable:true }));

/* ========== membership apps ========== */
const insertApp = db ? db.prepare(`
  INSERT INTO membership_applications
    (full_name,dob,email,phone,address,city,state,country,company,industry,role,bio,socials,headshot_key)
  VALUES
    (@full_name,@dob,@email,@phone,@address,@city,@state,@country,@company,@industry,@role,@bio,@socials,@headshot_key)
`) : null;

app.post('/api/applications', async (req, res) => {
  try {
    if (!insertApp) return res.status(500).json({ ok:false, error:'Storage not initialized.' });
    const n = (v) => String(v ?? '').trim();
    const r = req.body || {};
    const row = {
      full_name:n(r.fullName), dob:n(r.dob), email:n(r.email), phone:n(r.phone),
      address:n(r.address), city:n(r.city), state:n(r.state), country:n(r.country),
      company:n(r.company), industry:n(r.industry), role:n(r.role),
      bio:n(r.bio), socials:n(r.socials), headshot_key:n(r.headshotKey)
    };
    for (const k of ['full_name','dob','email','phone','address','city','state','country','company','industry','role','bio']) {
      if (!row[k]) return res.status(400).json({ ok:false, error:`Missing ${k}.` });
    }
    const info = insertApp.run(row);
    const id = info.lastInsertRowid;

    if (transporter) {
      const link = row.headshot_key ? `${PUBLIC_URL}/uploads/${row.headshot_key}` : '(no headshot)';
      const html = `
        <div style="font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#111">
          <h2 style="margin:0 0 8px">New Membership Application</h2>
          <p style="margin:0 0 10px;color:#444">#${id} • ${new Date().toLocaleString()}</p>
          <p><b>${escapeHtml(row.full_name)}</b> — ${escapeHtml(row.email)} — ${escapeHtml(row.phone)}</p>
          <p>${escapeHtml(row.address)}, ${escapeHtml(row.city)}, ${escapeHtml(row.state)}, ${escapeHtml(row.country)}</p>
          <p><b>${escapeHtml(row.company)}</b> • ${escapeHtml(row.industry)} • ${escapeHtml(row.role)}</p>
          <p><i>Socials:</i> ${escapeHtml(row.socials || '')}</p>
          <p><i>Headshot:</i> ${escapeHtml(link)}</p>
          <pre style="white-space:pre-wrap;margin-top:12px">${escapeHtml(row.bio)}</pre>
        </div>`;
      await transporter.sendMail({ to:EMAIL_TO, from:EMAIL_FROM, subject:`New Membership Application #${id}`, html });
    }

    return res.json({ ok:true, id });
  } catch (e) {
    console.error('POST /api/applications error:', e);
    return res.status(500).json({ ok:false, error:'Server error.' });
  }
});

/* ========== admin auth ========== */
app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!ADMIN_EMAIL || !ADMIN_HASH) return res.status(500).json({ ok:false, error:'Admin credentials not configured.' });
    if (!email || !password) return res.status(400).json({ ok:false, error:'Missing email or password.' });
    if (email !== ADMIN_EMAIL) return res.status(401).json({ ok:false, error:'Invalid credentials.' });
    const ok = await bcrypt.compare(password, ADMIN_HASH);
    if (!ok) return res.status(401).json({ ok:false, error:'Invalid credentials.' });
    return res.json({ ok:true });
  } catch (e) {
    console.error('POST /api/auth/login error:', e);
    return res.status(500).json({ ok:false, error:'Server error.' });
  }
});

/* ========== health & errors ========== */
app.get('/api/health', (_req,res)=>res.json({ ok:true, time:new Date().toISOString() }));
app.use((req,res)=>res.status(404).json({ ok:false, error:'Not found' }));
app.use((err,_req,res,_next)=>{ if (LOG_LEVEL==='debug') console.error(err); res.status(500).json({ ok:false, error:'Server error' }); });

/* ========== start with port fallback ========== */
function start(port, attemptsLeft = 10) {
  const s = app.listen(port, () => {
    console.log(`[nighthawks] listening on http://localhost:${port}`);
  });
  s.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      const next = port + 1;
      console.warn(`[nighthawks] Port ${port} in use. Trying ${next}…`);
      setTimeout(() => start(next, attemptsLeft - 1), 300);
    } else {
      console.error('[nighthawks] Server failed to start:', err);
      process.exit(1);
    }
  });
}
start(PORT);
