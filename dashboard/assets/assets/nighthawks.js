// assets/nighthawks.js
// --------- CONFIG ----------
const apiBase = location.hostname.includes("localhost")
  ? "http://localhost:3000"
  : "https://YOUR-API-DOMAIN.com"; // <- set this to your deployed API base

// --------- HELPERS ----------
async function postJSON(path, data) {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "Request failed");
  try { return JSON.parse(text); } catch { return { ok: true }; }
}

function serializeForm(form) {
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

// Optional: very light client-side required check
function requireFields(obj, fields) {
  const missing = fields.filter(k => !obj[k] || `${obj[k]}`.trim()==="");
  if (missing.length) throw new Error(`Missing: ${missing.join(", ")}`);
}

// --------- PAGE HOOKS ----------
document.addEventListener("DOMContentLoaded", () => {
  // APPLY FORM (membership.html)
  const applyForm = document.querySelector("#apply-form");
  if (applyForm) {
    applyForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const payload = serializeForm(applyForm);
        // adjust to your field names; example minimums:
        // requireFields(payload, ["fullName","email","dob"]);
        await postJSON("/api/applications", payload);
        window.location.href = "/thank-you.html?type=apply";
      } catch (err) {
        alert("Application failed: " + err.message);
      }
    });
  }

  // REQUEST FORM (request.html)
  const requestForm = document.querySelector("#request-form");
  if (requestForm) {
    requestForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const payload = serializeForm(requestForm);
        // Example minimums:
        // requireFields(payload, ["fullName","email","type"]);
        await postJSON("/api/requests", payload);
        window.location.href = "/thank-you.html?type=request";
      } catch (err) {
        alert("Request failed: " + err.message);
      }
    });
  }

  // SIGNUP (signup.html) — optional
  const signupForm = document.querySelector("#signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const payload = serializeForm(signupForm);
        // requireFields(payload, ["email","password"]);
        await postJSON("/api/auth/register", payload);
        window.location.href = "/signup-success.html";
      } catch (err) {
        alert("Signup failed: " + err.message);
      }
    });
  }

  // LOGIN (login.html)
  const loginForm = document.querySelector("#login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const payload = serializeForm(loginForm);
        // requireFields(payload, ["email","password"]);
        await postJSON("/api/auth/login", payload);
        window.location.href = "/dashboard.html";
      } catch (err) {
        alert("Sign-in failed: " + err.message);
      }
    });
  }
});
