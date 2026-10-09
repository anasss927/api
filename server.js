require('dotenv').config();
const app = require('./app');

const requiredEnv = ['JWT_SECRET', 'ADMIN_SECRET'];
const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length) {
  console.warn(`Warning: missing recommended env vars: ${missing.join(', ')} (see .env.example)`);
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`polsec-api listening on port ${PORT}`);
});
