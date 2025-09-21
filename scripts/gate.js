/* Nighthawks — Inner Circle Gate (polished)
   - Server-first verify (POST /verify-code)
   - Demo fallback allow-list (remove later)
   - Strong code normalization & light format guard
   - Loading spinner, throttle, focus trap, session unlock
*/

(() => {
  // ---- DOM hooks
  const gate   = document.getElementById('gate');
  const input  = document.getElementById('gateCode');
  const msg    = document.getElementById('gateError');
  const enter  = document.getElementById('gateEnter');
  const back   = document.getElementById('gateBack');
  const spin   = document.getElementById('gateSpin');

  if (!gate || !input || !enter) {
    // If the overlay isn't on this page, bail gracefully.
    return;
  }

  // ---- Config
  const STORAGE_KEY = 'nh_circle_unlocked';
  const COOLDOWN_MS = 900; // prevent spamming the endpoint / button

  // Remove once your backend is live
  const demoAllowlist = new Set([
    'IC-2025-NYC', // example guest code
    'NH1234',      // example member code
    'VIP5678'      // example member code
  ]);

  // ---- Utils
  const normalize = (v) =>
    (v || '')
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[–—]/g, '-'); // convert en/em dashes to hyphen

  const looksReasonable = (v) => /^[A-Z0-9-]{4,48}$/.test(v);

  function setLoading(on) {
    enter.disabled = !!on;
    if (spin) spin.style.display = on ? 'inline-block' : 'none';
  }

  function unlock() {
    document.body.classList.remove('locked');
    gate.style.display = 'none';
    document.removeEventListener('keydown', gateKeyHandler, true);
  }

  // Focus trap inside overlay
  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const focusables = gate.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const list = Array.from(focusables).filter((el) => !el.hasAttribute('disabled'));
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  function gateKeyHandler(e) {
    if (e.key === 'Enter' && document.activeElement === input) {
      e.preventDefault(); handleSubmit();
    }
    if (e.key === 'Tab') trapFocus(e);
    // (optional) if you ever want ESC to do nothing, just leave it; we keep it inert for exclusivity
  }

  // ---- Verification
  async function verifyWithServer(code) {
    try {
      const res = await fetch('/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!(data && data.success);
    } catch {
      return false; // no backend yet / offline
    }
  }

  function verifyLocal(code) {
    return demoAllowlist.has(code);
  }

  // ---- Submit
  let lastSubmit = 0;
  async function handleSubmit() {
    const now = Date.now();
    if (now - lastSubmit < COOLDOWN_MS) return;
    lastSubmit = now;

    msg.textContent = '';
    const raw = input.value;
    const code = normalize(raw);

    if (!code) {
      msg.textContent = 'Please enter your code.'; input.focus(); return;
    }
    if (!looksReasonable(code)) {
      msg.textContent = 'Code format not recognized.'; input.focus(); return;
    }

    setLoading(true);

    // 1) Try server; 2) Fallback to local allow-list
    let ok = await verifyWithServer(code);
    if (!ok) ok = verifyLocal(code);

    if (ok) {
      sessionStorage.setItem(STORAGE_KEY, '1');

      // EITHER reveal the page:
      unlock();

      // OR redirect to a confirmation page; uncomment to use:
      // window.location.href = 'private-dinner.html';
      // return;
    } else {
      msg.textContent = 'Invalid or expired code.';
      setLoading(false);
      input.focus(); input.select();
    }
  }

  // ---- Wire up
  back?.addEventListener('click', () => history.back());
  enter.addEventListener('click', handleSubmit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmit(); });
  document.addEventListener('keydown', gateKeyHandler, true);
  document.addEventListener('DOMContentLoaded', () => input && input.focus());

  // ---- Skip gate if already unlocked in this tab
  if (sessionStorage.getItem(STORAGE_KEY) === '1') {
    unlock();
  }
})();
