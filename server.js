// Nighthawks — RSVP backend (static site + code verify + RSVP save)
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 5000);

/* ── Security & middleware ── */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(
  session({
    name: "nhx.sid",
    secret: process.env.SESSION_SECRET || "change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: !!Number(process.env.COOKIE_SECURE), // set 1 in prod (HTTPS)
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);
app.use(["/api/verify-code", "/api/rsvp"], rateLimit({ windowMs: 60_000, max: 60 }));
app.get("/robots.txt", (_req, res) => res.type("text/plain").send("User-agent: *\nDisallow: /\n"));

/* ── Static files ──
   Serves everything under the project root (e.g., /email/invite.html, /rsvp.html). */
app.use(express.static(__dirname, { extensions: ["html"] }));

// Convenience alias: /invite.html → /email/invite.html if you keep it under /email
app.get("/invite.html", (req, res, next) => {
  const fp = path.join(__dirname, "email", "invite.html");
  if (fs.existsSync(fp)) return res.sendFile(fp);
  return next();
});

/* ── Data store ── */
const DATA_DIR = path.join(__dirname, "data");
const RSVPS_FILE = path.join(DATA_DIR, "rsvps.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(RSVPS_FILE)) fs.writeFileSync(RSVPS_FILE, "[]");

/* ── Codes ── */
const codeList = () =>
  (process.env.ACCESS_CODES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const isValidCode = (code) =>
  !!code && codeList().map((x) => x.toUpperCase()).includes(String(code).trim().toUpperCase());

/* ── Signed invite token support ── */
function verifyInviteToken(token) {
  try {
    const secret = (process.env.INVITE_SIGNING_SECRET || "").trim();
    if (!secret) return null;
    const [p64, s64] = String(token || "").split(".");
    if (!p64 || !s64) return null;

    const payload = JSON.parse(Buffer.from(p64, "base64url").toString("utf8"));
    if (!payload.email || !payload.exp) return null;
    if (Math.floor(Date.now() / 1000) > Number(payload.exp)) return null;

    const expected = crypto.createHmac("sha256", secret).update(p64).digest("base64url");
    if (expected !== s64) return null;
    return payload;
  } catch {
    return null;
  }
}

// /invite?t=SIGNED&c=CODE[&name=...]
// Verifies token and forwards guests to /rsvp with code/name prefilled.
app.get("/invite", (req, res) => {
  const payload = verifyInviteToken(req.query.t);
  if (!payload) return res.status(404).send("Not found");

  req.session.invited = true;
  req.session.inviteeEmail = payload.email;

  const params = new URLSearchParams();
  if (req.query.c) params.set("code", String(req.query.c));
  if (req.query.name) params.set("name", String(req.query.name));

  return res.redirect("/rsvp" + (params.toString() ? `?${params}` : ""));
});

/* ── API: verify code ── */
app.post("/api/verify-code", (req, res) => {
  try {
    const { code } = req.body || {};
    if (!isValidCode(code)) return res.json({ ok: false });
    req.session.validCode = String(code || "").trim().toUpperCase();
    return res.json({ ok: true });
  } catch (e) {
    console.error("verify-code error:", e);
    return res.status(500).json({ ok: false });
  }
});

/* ── API: submit RSVP ── */
app.post("/api/rsvp", async (req, res) => {
  try {
    const n = (v) => (v == null ? "" : String(v).trim());
    const record = {
      id: crypto.randomBytes(16).toString("hex"),
      createdAt: new Date().toISOString(),
      code: n(req.body.code || req.session.validCode || ""),
      firstName: n(req.body.firstName),
      lastName: n(req.body.lastName),
      plusOne: n(req.body.plusOne), // "yes" | "no"
      guestName: n(req.body.guestName),
      notify: n(req.body.notify), // "email" | "text" | "both"
      email: n(req.body.email),
      phone: n(req.body.phone),
      diet: n(req.body.diet),
      notes: n(req.body.notes),
    };

    if (!record.code || !isValidCode(record.code))
      return res.status(400).json({ ok: false, error: "invalid-code" });
    if (!record.firstName || !record.lastName || !record.notify || !record.plusOne)
      return res.status(400).json({ ok: false, error: "missing-fields" });

    const rows = JSON.parse(await fsp.readFile(RSVPS_FILE, "utf8"));
    rows.push(record);
    await fsp.writeFile(RSVPS_FILE, JSON.stringify(rows, null, 2));

    return res.json({ ok: true });
  } catch (e) {
    console.error("rsvp error:", e);
    return res.status(500).json({ ok: false });
  }
});

/* ── Health ── */
app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

/* ── Start ── */
app.listen(PORT, () => {
  console.log("Valid codes:", codeList());
  console.log(`Nighthawks server running → http://localhost:${PORT}`);
});
