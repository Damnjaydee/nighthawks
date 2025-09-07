// verify-hash.js
const bcrypt = require('bcryptjs');
const plain = process.argv[2];
const hash  = process.argv[3];
console.log('Password matches hash?', bcrypt.compareSync(plain, hash));
