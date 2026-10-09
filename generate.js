const crypto = require('crypto');

// Generates a key like POLSEC-XXXX-XXXX-XXXX-XXXX
function generateKey(prefix = 'POLSEC') {
  const segment = () => crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${segment()}-${segment()}-${segment()}-${segment()}`;
}

// Generates a random loader string / token
function generateLoaderString(length = 24) {
  return crypto.randomBytes(length).toString('base64url');
}

module.exports = { generateKey, generateLoaderString };
