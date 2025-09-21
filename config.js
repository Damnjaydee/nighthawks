// config.js — Nighthawks global config (browser JS only)
// Keep this as a .js file (NOT .cjs). Include with: <script src="./config.js"></script>

(function (w) {
  "use strict";

  const NH = (w.NH = w.NH || {});
  NH.VERSION = "2025-09-21.1";

  /* -----------------------------
   * PROVIDER (choose one)
   * --------------------------- */
  // Use "stripe" today (test mode). Flip to "tock" when you subscribe to Tock.
  NH.PAYMENT_PROVIDER = "stripe"; // "stripe" | "tock"

  /* -----------------------------
   * STRIPE (no monthly fee)
   * --------------------------- */
  // Create a Stripe Payment Link (qty allowed 1–2) and set the redirect to:
  //   https://YOURDOMAIN/thank-you.html?ref=stripe
  NH.STRIPE_ENV = "test"; // "test" | "live"

  // Your links:
  NH.STRIPE_TEST_LINK = "https://buy.stripe.com/test_9B628ra9Z44y2EV0pefYY00"; // ← your test link
  NH.STRIPE_LIVE_LINK = ""; // ← paste when you go live

  // Resolved link the app should use:
  Object.defineProperty(NH, "STRIPE_LINK", {
    configurable: false,
    enumerable: true,
    get() {
      return NH.STRIPE_ENV === "live" && NH.STRIPE_LIVE_LINK
        ? NH.STRIPE_LIVE_LINK
        : NH.STRIPE_TEST_LINK;
    },
  });

  /* Small helper to compose a Stripe URL with params */
  NH.buildStripeUrl = (params = {}) => {
    const base = NH.STRIPE_LINK || "";
    const q = new URLSearchParams(params);
    return base ? `${base}${base.includes("?") ? "&" : "?"}${q}` : "";
  };

  /* -----------------------------
   * TOCK (paid; optional later)
   * --------------------------- */
  // Fill ONLY if/when you flip PAYMENT_PROVIDER to "tock".
  NH.TOCK_SLUG = "";        // e.g. "nighthawks-concierge"
  NH.TOCK_OFFERING_ID = ""; // from Tock Widget Builder

  /* -----------------------------
   * INVITE CONTROL (pick ONE)
   * --------------------------- */
  // A) Plain codes (simplest)
  NH.INVITE_CODES = ["IC-1234"]; // add/remove as needed

  // B) Or SHA-256 hashes (more discreet). If you use this, REMOVE INVITE_CODES above.
  // NH.INVITE_HASHES = ["<sha256-hex-of-IC-1234>"];
  // To generate in your browser console:
  // (async code => {
  //   const norm = s => s.trim().toUpperCase().replace(/\s+/g,"");
  //   const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm(code)));
  //   console.log(Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join(""));
  // })("IC-1234");

  /* -----------------------------
   * Dev helpers & overrides
   * --------------------------- */
  // Quick hasher you can call from the console: await NH.hashInvite("IC-1234")
  NH.hashInvite = async (code) => {
    const norm = (s) => s.toString().trim().toUpperCase().replace(/\s+/g, "");
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm(code)));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  // Allow quick testing via URL, e.g. ?provider=tock or ?env=live
  // (Session-scoped; removed when the tab is closed.)
  (function applyQueryOverrides() {
    try {
      const qs = new URLSearchParams(location.search);
      const p = qs.get("provider"); // "stripe" | "tock"
      const e = qs.get("env");      // "test" | "live"

      if (p === "stripe" || p === "tock") {
        sessionStorage.setItem("nh_provider", p);
      }
      if (e === "test" || e === "live") {
        sessionStorage.setItem("nh_stripe_env", e);
      }

      const pOv = sessionStorage.getItem("nh_provider");
      const eOv = sessionStorage.getItem("nh_stripe_env");
      if (pOv) NH.PAYMENT_PROVIDER = pOv;
      if (eOv) NH.STRIPE_ENV = eOv;
    } catch {}
  })();

  // Common quantity helper (clamps to 1..2)
  NH.qtyFromPlusOne = (plusOne) => (plusOne ? 2 : 1);

  /* -----------------------------
   * Sanity checks (console only)
   * --------------------------- */
  (function sanity() {
    const warn = (...a) => console.warn("[NH]", ...a);

    if (NH.PAYMENT_PROVIDER === "stripe" && !NH.STRIPE_LINK) {
      warn("STRIPE_LINK is missing — paste your Stripe Payment Link in config.js.");
    }
    if (NH.PAYMENT_PROVIDER === "tock" && (!NH.TOCK_SLUG || !NH.TOCK_OFFERING_ID)) {
      warn("TOCK_SLUG / TOCK_OFFERING_ID are missing — fill them in config.js.");
    }
    if ((NH.INVITE_CODES?.length || 0) && (NH.INVITE_HASHES?.length || 0)) {
      warn("Use INVITE_CODES OR INVITE_HASHES — not both.");
    }
  })();

  // Freeze in production if you want to avoid accidental runtime edits:
  // Object.freeze(NH);
})(window);
