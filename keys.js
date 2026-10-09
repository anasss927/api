const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { strictLimiter } = require('../middleware/rateLimit');
const { generateKey, generateLoaderString } = require('../utils/generate');

const router = express.Router();

function rowIsExpired(row) {
  return row.expires_at && row.expires_at < Date.now();
}

function serializeKey(row) {
  return {
    key: row.key,
    note: row.note,
    maxUses: row.max_uses,
    uses: row.uses,
    revoked: !!row.revoked,
    expiresAt: row.expires_at,
    expired: rowIsExpired(row),
    createdAt: row.created_at,
    redeemedBy: row.redeemed_by,
    redeemedAt: row.redeemed_at,
  };
}

// POST /keys - create a single key (admin only)
router.post('/', requireAdmin, (req, res) => {
  const { note, expiresInSeconds, maxUses, loaderString, rawLink, prefix } = req.body || {};

  const key = generateKey(prefix || 'POLSEC');
  const now = Date.now();
  const expiresAt = expiresInSeconds ? now + Number(expiresInSeconds) * 1000 : null;
  const finalLoaderString = loaderString || generateLoaderString();

  const stmt = db.prepare(`
    INSERT INTO keys (key, note, max_uses, uses, loader_string, raw_link, expires_at, revoked, created_at)
    VALUES (?, ?, ?, 0, ?, ?, ?, 0, ?)
  `);
  stmt.run(key, note || null, maxUses || 1, finalLoaderString, rawLink || null, expiresAt, now);

  const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(key);
  res.status(201).json({ key: serializeKey(row) });
});

// POST /keys/bulk - create multiple keys at once (admin only)
router.post('/bulk', requireAdmin, (req, res) => {
  const { count, note, expiresInSeconds, maxUses, prefix } = req.body || {};
  const n = Math.min(Number(count) || 0, 500);

  if (!n || n < 1) {
    return res.status(400).json({ error: 'count must be a positive integer (max 500)' });
  }

  const now = Date.now();
  const expiresAt = expiresInSeconds ? now + Number(expiresInSeconds) * 1000 : null;

  const insert = db.prepare(`
    INSERT INTO keys (key, note, max_uses, uses, loader_string, raw_link, expires_at, revoked, created_at)
    VALUES (?, ?, ?, 0, ?, NULL, ?, 0, ?)
  `);

  const created = [];
  const insertMany = db.transaction((count) => {
    for (let i = 0; i < count; i++) {
      const key = generateKey(prefix || 'POLSEC');
      const loaderString = generateLoaderString();
      insert.run(key, note || null, maxUses || 1, loaderString, expiresAt, now);
      created.push(key);
    }
  });
  insertMany(n);

  res.status(201).json({ createdCount: created.length, keys: created });
});

// GET /keys - list all keys (admin only)
router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM keys ORDER BY created_at DESC').all();
  res.json({ count: rows.length, keys: rows.map(serializeKey) });
});

// GET /keys/:key/validate - check if a key is valid (public-ish, rate limited)
router.get('/:key/validate', strictLimiter, (req, res) => {
  const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(req.params.key);

  if (!row) return res.json({ valid: false, reason: 'not_found' });
  if (row.revoked) return res.json({ valid: false, reason: 'revoked' });
  if (rowIsExpired(row)) return res.json({ valid: false, reason: 'expired' });
  if (row.uses >= row.max_uses) return res.json({ valid: false, reason: 'exhausted' });

  res.json({ valid: true });
});

// POST /keys/:key/redeem - redeem/use a key
router.post('/:key/redeem', strictLimiter, (req, res) => {
  const { discordId } = req.body || {};
  if (!discordId) return res.status(400).json({ error: 'discordId is required' });

  const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Key not found' });
  if (row.revoked) return res.status(410).json({ error: 'Key has been revoked' });
  if (rowIsExpired(row)) return res.status(410).json({ error: 'Key has expired' });
  if (row.uses >= row.max_uses) return res.status(409).json({ error: 'Key has no remaining uses' });

  const now = Date.now();
  db.prepare(`
    UPDATE keys SET uses = uses + 1, redeemed_by = ?, redeemed_at = ?
    WHERE key = ?
  `).run(discordId, now, row.key);

  // Link the redeemer to this key automatically
  db.prepare(`
    INSERT INTO links (discord_id, key, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET key = excluded.key, updated_at = excluded.updated_at
  `).run(discordId, row.key, now, now);

  const updated = db.prepare('SELECT * FROM keys WHERE key = ?').get(row.key);
  res.json({ redeemed: true, key: serializeKey(updated) });
});

// GET /keys/:key/loader - retrieve raw link / loader string for a valid key
router.get('/:key/loader', strictLimiter, (req, res) => {
  const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Key not found' });
  if (row.revoked) return res.status(410).json({ error: 'Key has been revoked' });
  if (rowIsExpired(row)) return res.status(410).json({ error: 'Key has expired' });

  res.json({ loaderString: row.loader_string, rawLink: row.raw_link });
});

// PATCH /keys/:key/loader - set a custom loader string / raw link (admin only)
router.patch('/:key/loader', requireAdmin, (req, res) => {
  const { loaderString, rawLink } = req.body || {};
  const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Key not found' });

  db.prepare('UPDATE keys SET loader_string = COALESCE(?, loader_string), raw_link = COALESCE(?, raw_link) WHERE key = ?')
    .run(loaderString ?? null, rawLink ?? null, row.key);

  const updated = db.prepare('SELECT * FROM keys WHERE key = ?').get(row.key);
  res.json({ loaderString: updated.loader_string, rawLink: updated.raw_link });
});

// DELETE /keys/:key - revoke/delete a key (admin only)
router.delete('/:key', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM keys WHERE key = ?').run(req.params.key);
  if (result.changes === 0) return res.status(404).json({ error: 'Key not found' });
  res.json({ deleted: true });
});

// POST /keys/:key/revoke - revoke without deleting (admin only)
router.post('/:key/revoke', requireAdmin, (req, res) => {
  const result = db.prepare('UPDATE keys SET revoked = 1 WHERE key = ?').run(req.params.key);
  if (result.changes === 0) return res.status(404).json({ error: 'Key not found' });
  res.json({ revoked: true });
});

module.exports = router;
