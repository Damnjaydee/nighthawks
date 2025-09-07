// Nighthawks — Unified server (static + RSVP + Concierge + Auth)
// CommonJS (matches your project)

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const crypto = require('crypto');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
let Database; try { Database = require('better-sqlite3'); } catch (_) {}

const app = express();

/* ================= Config helpers ================= */
const env = (k, d = '') => (process.env[k] ?? d);
const asInt  = (v, d) => { const n = parseInt(String(v ?? ''), 10); return Number.isFinite(n) ? n : d; };
const asBool = (v, d=false) => (v == null ? d : /^(1|true|yes|on)$/i.test(String(v).trim()));
const splitCSV = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);

const PUBLIC_URL          = env('PUBLIC_URL', 'https://nhconcerige.com');
const PORT_BASE           = asInt(env('PORT', 5000), 5000);
const TRUST_PROXY         = asInt(env('TRUST_PROXY', '1'), 1);
const COOKIE_SECURE       = asBool(env('COOKIE_SECURE', '1'), true);
const SESSION_SECRET      = env('SESSION_SECRET', '');
const SESSION_COOKIE_NAME = env('SESSION_COOKIE_NAME', 'nighthawks.sid');
const SESSION_TTL_SECONDS = asInt(env('SESSION_TTL_SECONDS', 60*60*8), 60*60*8);
const LOG_LEVEL           = env('LOG_LEVEL', 'info');

const CORS_ORIGINS = new Set(
  splitCSV(env('CORS_ORIGINS', [PUBLIC_URL, 'http://localhost:5000', 'http://127.0.0.1:5500'].join(',')))
);

const WINDOW_MIN  = asInt(env('RATE_LIMIT_WINDOW_MIN', 15), 15);
const RL_MAX      = asInt(env('RATE_LIMIT_MAX', 100), 100);
const RL_AUTH_MAX = asInt(env('AUTH_RATE_LIMIT_MAX', 50), 50);

const SQLITE_DB_PATH = env('SQLITE_DB_PATH', path.join(process.cwd(), 'db', 'requests.db'));
const ADMIN_EMAIL    = (env('ADMIN_EMAIL', '') || '').trim().toLowerCase();
const ADMIN_HASH     = env('ADMIN_PASSWORD_HASH', ''); // MUST be a bcrypt hash

const ACCESS_CODES          = splitCSV(env('ACCESS_CODES', ''));
const INVITES_ENABLED       = asBool(env('INVITES_ENABLED', '0'), false);
const INVITE_SIGNING_SECRET = env('INVITE_SIGNING_SECRET', '');
const INVITE_DAYS           = asInt(env('INVITE_DAYS', 14), 14);

const SMTP_HOST  = env('SMTP_HOST', '');
const SMTP_PORT  = asInt(env('SMTP_PORT', 587), 587);
const SMTP_SECURE= asBool(env('SMTP_SECURE', 'false'), false);
const SMTP_USER  = env('SMTP_USER', '');
const SMTP_PASS  = env('SMTP_PASS', '');
const EMAIL_FROM = env('EMAIL_FROM', 'Nighthawks <no-reply@nhconcerige.com>');
const EMAIL_TO   = env('EMAIL_TO',   'concierge@nhconcerige.com');

/* ================= Trust proxy / security / parsers ================= */
app.set('trust proxy', TRUST_PROXY);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);       // same-origin / curl
    if (CORS_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'), false);
  },
  credentials: false
}));

// Preflight for all APIs
app.options('/api/*', cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (CORS_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'), false);
  }
}));

// Graceful CORS error response (avoids stack traces)
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ ok:false, error: 'CORS blocked: ' + (req.headers.origin || 'unknown') });
  }
  return next(err);
});

app.use(cookieParser());
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

app.use(session({
  name: SESSION_COOKIE_NAME,
  secret: SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,               // 0 for local HTTP, 1 for prod HTTPS
    maxAge: SESSION_TTL_SECONDS * 1000
  }
}));

/* ================= Rate limits ================= */
const windowMs    = WINDOW_MIN * 60 * 1000;
const apiLimiter  = rateLimit({ windowMs, limit: RL_MAX });
const authLimiter = rateLimit({ windowMs, limit: RL_AUTH_MAX });
app.use(['/api', '/api/*'], apiLimiter);
app.use(['/api/auth', '/api/auth/*'], authLimiter);

/* ================= Robots ================= */
app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

/* ================= Static files ================= */
app.use(express.static(__dirname, { extensions: ['html'] }));
app.get('/invite.html', (req, res, next) => {
  const fp = path.join(__dirname, 'email', 'invite.html');
  if (fs.existsSync(fp)) return res.sendFile(fp);
  return next();
});

/* ================= RSVP storage (JSON file) ================= */
const DATA_DIR   = path.join(__dirname, 'data');
const RSVPS_FILE = path.join(DATA_DIR, 'rsvps.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(RSVPS_FILE)) fs.writeFileSync(RSVPS_FILE, '[]');

async function readJsonArray(file) {
  try { const arr = JSON.parse(await fsp.readFile(file, 'utf8')); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}
async function writeJsonArrayAtomic(file, arr) {
  const tmp = file + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(arr, null, 2));
  await fsp.rename(tmp, file);
}

/* ================= Codes / Invite tokens ================= */
const codeList = () => ACCESS_CODES;
const isValidCode = (code) =>
  !!code && codeList().map(x => x.toUpperCase()).includes(String(code).trim().toUpperCase());

function verifyInviteToken(token) {
  if (!INVITES_ENABLED) return null;
  try {
    const secret = INVITE_SIGNING_SECRET.trim();
    if (!secret) return null;
    const [p64, s64] = String(token || '').split('.');
    if (!p64 || !s64) return null;

    const payload = JSON.parse(Buffer.from(p64, 'base64url').toString('utf8'));
    if (!payload.email || !payload.exp) return null;
    if (Math.floor(Date.now() / 1000) > Number(payload.exp)) return null;

    const expected = crypto.createHmac('sha256', secret).update(p64).digest('base64url');
    if (expected !== s64) return null;
    return payload;
  } catch { return null; }
}

// /invite?t=SIGNED&c=CODE[&name=...]
app.get('/invite', (req, res) => {
  const payload = verifyInviteToken(req.query.t);
  if (!payload) return res.status(404).send('Not found');

  req.session.invited = true;
  req.session.inviteeEmail = payload.email;

  const params = new URLSearchParams();
  if (req.query.c) params.set('code', String(req.query.c));
  if (req.query.name) params.set('name', String(req.query.name));

  return res.redirect('/rsvp' + (params.toString() ? `?${params}` : ''));
});

/* ================= API: Verify access code ================= */
app.post('/api/verify-code', (req, res) => {
  try {
    const { code } = req.body || {};
    if (!isValidCode(code)) return res.json({ ok:false });
    req.session.validCode = String(code || '').trim().toUpperCase();
    return res.json({ ok:true });
  } catch (e) {
    if (LOG_LEVEL === 'debug') console.error('verify-code error:', e);
    return res.status(500).json({ ok:false });
  }
});

/* ================= API: Submit RSVP ================= */
app.post('/api/rsvp', async (req, res) => {
  try {
    const n = (v) => (v == null ? '' : String(v).trim());
    const record = {
      id: crypto.randomBytes(16).toString('hex'),
      createdAt: new Date().toISOString(),
      code: n(req.body.code || req.session.validCode || ''),
      firstName: n(req.body.firstName),
      lastName: n(req.body.lastName),
      plusOne: n(req.body.plusOne),
      guestName: n(req.body.guestName),
      notify: n(req.body.notify),
      email: n(req.body.email),
      phone: n(req.body.phone),
      diet: n(req.body.diet),
      notes: n(req.body.notes),
    };

    if (!record.code || !isValidCode(record.code))
      return res.status(400).json({ ok:false, error:'invalid-code' });
    if (!record.firstName || !record.lastName || !record.notify || !record.plusOne)
      return res.status(400).json({ ok:false, error:'missing-fields' });

    const rows = await readJsonArray(RSVPS_FILE);
    rows.push(record);
    await writeJsonArrayAtomic(RSVPS_FILE, rows);
    return res.json({ ok:true });
  } catch (e) {
    console.error('rsvp error:', e);
    return res.status(500).json({ ok:false });
  }
});

/* ================= OPTIONAL: Concierge Request API ================= */
let db = null, insertReq = null, transporter = null;

(async () => {
  if (Database) {
    try {
      const dbDir = path.dirname(SQLITE_DB_PATH);
      await fsp.mkdir(dbDir, { recursive: true });
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
      insertReq = db.prepare(`
        INSERT INTO concierge_requests
          (full_name, email, phone, type, date_pref, time_pref, party_size, neighborhood, budget, details, ip)
        VALUES
          (@full_name, @email, @phone, @type, @date_pref, @time_pref, @party_size, @neighborhood, @budget, @details, @ip)
      `);
    } catch (e) {
      console.warn('[bootstrap] SQLite not initialized:', e.message);
    }
  }

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
})();

const escapeHtml = (s='') => String(s)
  .replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
const trimMax = (v, n) => String(v ?? '').trim().slice(0, n);

app.post('/api/request', async (req, res) => {
  try {
    const {
      fullName, email, phone = '', typeOfRequest,
      date = '', time = '', partySize = '', neighborhood = '',
      budget = '', details = '', company // honeypot
    } = req.body || {};

    if (company && String(company).trim() !== '') {
      return res.status(400).json({ ok:false, error:'Rejected.' });
    }
    if (!fullName || !email || !typeOfRequest) {
      return res.status(400).json({ ok:false, error:'Missing required fields.' });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ ok:false, error:'Invalid email.' });
    }
    if (!insertReq) {
      return res.status(500).json({ ok:false, error:'Storage not initialized.' });
    }

    const row = {
      full_name:    trimMax(fullName, 200),
      email:        trimMax(email, 320),
      phone:        trimMax(String(phone).replace(/[^\d+]/g, '').slice(0, 16), 32),
      type:         trimMax(typeOfRequest, 200),
      date_pref:    trimMax(date, 40),
      time_pref:    trimMax(time, 40),
      party_size:   trimMax(String(partySize), 40),
      neighborhood: trimMax(neighborhood, 200),
      budget:       trimMax(budget, 200),
      details:      trimMax(details, 5000),
      ip:           trimMax((req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || ''), 64),
    };

    const info = insertReq.run(row);
    const id = info.lastInsertRowid;

    if (transporter) {
      const html = `
        <div style="font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
          <h2 style="margin:0 0 8px">New Concierge Request</h2>
          <p style="margin:0 0 10px;color:#444">#${id} • ${new Date().toLocaleString()}</p>
          <table style="border-collapse:collapse">
            <tbody>
              <tr><td style="padding:6px 8px;border:1px solid #eee">Name</td><td style="padding:6px 8px;border:1px solid #eee">${escapeHtml(row.full_name)}</td></tr>
              <tr><td style="padding:6px 8px;border:1px solid #eee">Email</td><td style="padding:6px 8px;border:1px solid #eee">${escapeHtml(row.email)}</td></tr>
              <tr><td style="padding:6px 8px;border:1px solid #eee">Phone</td><td style="padding:6px 8px;border:1px solid #eee">${escapeHtml(row.phone)}</td></tr>
              <tr><td style="padding:6px 8px;border:1px solid #eee">Type</td><td style="padding:6px 8px;border:1px solid #eee">${escapeHtml(row.type)}</td></tr>
              <tr><td style="padding:6px 8px;border:1px solid #eee">Date</td><td style="padding:6px 8px;border:1px solid #eee">${escapeHtml(row.date_pref)}</td></tr>
              <tr><td style="padding:6px 8px;border:1px solid #eee">Time</td><td style="padding:6px 8px;border:1px solid #eee">${escapeHtml(row.time_pref)}</td></tr>
              <tr><td style="padding:6px 8px;border:1px solid #eee">Party Size</td><td style="padding:6px 8px;border:1px solid #eee">${escapeHtml(row.party_size)}</td></tr>
              <tr><td style="padding:6px 8px;border:1px solid #eee">Neighborhood</td><td style="padding:6px 8px;border:1px solid #eee">${escapeHtml(row.neighborhood)}</td></tr>
              <tr><td style="padding:6px 8px;border:1px solid #eee">Budget</td><td style="padding:6px 8px;border:1px solid #eee">${escapeHtml(row.budget)}</td></tr>
              <tr><td style="padding:6px 8px;border:1px solid #eee">Details</td><td style="padding:6px 8px;border:1px solid #eee"><pre style="white-space:pre-wrap;margin:0">${escapeHtml(row.details)}</pre></td></tr>
              <tr><td style="padding:6px 8px;border:1px solid #eee">IP</td><td style="padding:6px 8px;border:1px solid #eee">${escapeHtml(row.ip)}</td></tr>
            </tbody>
          </table>
        </div>`;
      await transporter.sendMail({
        to: EMAIL_TO, from: EMAIL_FROM,
        subject: `New Concierge Request #${id} — ${row.full_name}`,
        html
      });
    }

    return res.json({ ok:true, id });
  } catch (e) {
    console.error('POST /api/request error:', e);
    return res.status(500).json({ ok:false, error:'Server error.' });
  }
});

/* ================= API: Admin auth (env-based) ================= */
app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!ADMIN_EMAIL || !ADMIN_HASH) {
      return res.status(500).json({ ok:false, error:'Admin credentials not configured.' });
    }
    if (!email || !password) {
      return res.status(400).json({ ok:false, error:'Missing email or password.' });
    }
    if (email !== ADMIN_EMAIL) {
      return res.status(401).json({ ok:false, error:'Invalid credentials.' });
    }
    const ok = await bcrypt.compare(password, ADMIN_HASH);
    if (!ok) return res.status(401).json({ ok:false, error:'Invalid credentials.' });

    // If you later want a session: req.session.admin = { email: ADMIN_EMAIL, at: Date.now() };
    return res.json({ ok:true });
  } catch (e) {
    console.error('POST /api/auth/login error:', e);
    return res.status(500).json({ ok:false, error:'Server error.' });
  }
});

/* ================= Health ================= */
app.get('/api/health', (_req, res) => res.json({ ok:true, time:new Date().toISOString() }));

/* ================= 404 & Error handlers ================= */
app.use((req, res) => res.status(404).json({ ok:false, error:'Not found' }));
app.use((err, _req, res, _next) => {
  if (LOG_LEVEL === 'debug') console.error('Unhandled error:', err);
  res.status(500).json({ ok:false, error:'Server error' });
});

/* ================= Start with port fallback ================= */
function startServer(port, attemptsLeft = 10) {
  const server = app.listen(port, () => {
    console.log('[nighthawks] env:', process.env.NODE_ENV || 'production');
    console.log('[nighthawks] base:', PUBLIC_URL);
    console.log('[nighthawks] trust proxy:', TRUST_PROXY);
    console.log('[nighthawks] valid codes:', codeList());
    console.log(`[nighthawks] listening on http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      const next = port + 1;
      console.warn(`[nighthawks] Port ${port} in use. Trying ${next}…`);
      setTimeout(() => startServer(next, attemptsLeft - 1), 300);
    } else {
      console.error('[nighthawks] Server failed to start:', err);
      process.exit(1);
    }
  });
}

startServer(PORT_BASE);
