// gen-hash.js
// Usage: node gen-hash.js "YourPasswordHere"

const bcrypt = require('bcryptjs');

// Get password from CLI args
const pwd = process.argv[2];
if (!pwd) {
  console.error("❌ Please provide a password.\nUsage: node gen-hash.js \"YourPasswordHere\"");
  process.exit(1);
}

// Generate bcrypt hash with cost factor 12 (secure & fast enough)
bcrypt.hash(pwd, 12).then(hash => {
  console.log("✅ Bcrypt hash generated:\n");
  console.log(hash);
  console.log("\n👉 Copy this into your .env as ADMIN_PASSWORD_HASH");
}).catch(err => {
  console.error("Error generating hash:", err);
  process.exit(1);
});
