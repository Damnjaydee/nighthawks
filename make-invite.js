// Nighthawks — Invite link generator (HMAC signed)
// Usage examples:
//   node invite.js --name "Ava Stone" --email ava@example.com --code VIP456
//   node invite.js --email jet@example.com --days 10
//
// .env requirements:
//   INVITE_SIGNING_SECRET=change-this-long-random-too
//   INVITE_BASE_URL=https://rsvp.yourdomain.com
//   INVITE_DAYS=14   # default expiry if --days not passed

require("dotenv").config();
const crypto = require("crypto");

function arg(flag, fallback = "") {
  const idx = process.argv.findIndex((x) => x === flag || x.startsWith(flag + "="));
  if (idx === -1) return fallback;
  const val = process.argv[idx].includes("=")
    ? process.argv[idx].split("=")[1]
    : process.argv[idx + 1];
  return val || fallback;
}

const name = arg("--name", "").trim();
const email = arg("--email", "").trim();
const code = arg("--code", "").trim();
const days = Number(arg("--days", process.env.INVITE_DAYS || 14));

if (!email) {
  console.error("❌ Missing --email");
  process.exit(1);
}

const baseUrl = (process.env.INVITE_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const secret = (process.env.INVITE_SIGNING_SECRET || "").trim();
if (!secret) {
  console.error("❌ Missing INVITE_SIGNING_SECRET in .env");
  process.exit(1);
}

const exp = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60; // unix seconds
const payload = { email, exp };
const p64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = crypto.createHmac("sha256", secret).update(p64).digest("base64url");
const token = `${p64}.${sig}`;

const url = `${baseUrl}/invite?t=${token}${code ? `&c=${encodeURIComponent(code)}` : ""}`;

console.log("✔ Invite created");
console.log("Name  :", name || "(none)");
console.log("Email :", email);
console.log("Code  :", code || "(none)");
console.log("Expires in (days):", days);
console.log("Invite URL:");
console.log(url);

// Optional: output a simple email snippet you can paste into your sender.
const subject = "Private access — RSVP";
const bodyText =
  `Hi ${name || ""}`.trim() +
  `,\n\n` +
  `You’ve been selected to join a small, Mediterranean-inspired dinner in NYC. ` +
  `Capacity is limited. Please confirm via the private link below.\n\n${url}\n\n` +
  `Note: location and details appear upon acceptance.\n` +
  `Please do not forward.`;

console.log("\n— Suggested Email —");
console.log("Subject:", subject);
console.log("Body:\n" + bodyText);
