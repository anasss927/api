const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { strictLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// POST /links - link a Discord ID with a key and/or an external account
router.post('/', strictLimiter, (req, res) => {
  const { discordId, key, externalId } = req.body || {};
  if (!discordId) return res.status(400).json({ error: 'discordId is required' });
  if (!key && !externalId) {
    return res.status(400).json({ error: 'Provide at least one of: key, externalId' });
  }

  if (key) {
    const keyRow = db.prepare('SELECT * FROM keys WHERE key = ?').get(key);
    if (!keyRow) return res.status(404).json({ error: 'Key not found' });
  }

  const now = Date.now();
  db.prepare(`
    INSERT INTO links (discord_id, key, external_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      key = COALESCE(excluded.key, links.key),
      external_id = COALESCE(excluded.external_id, links.external_id),
      updated_at = excluded.updated_at
  `).run(discordId, key || null, externalId || null, now, now);

  const row = db.prepare('SELECT * FROM links WHERE discord_id = ?').get(discordId);
  res.status(201).json({ linked: true, link: row });
});

// GET /links/:discordId - get linked data by Discord ID
router.get('/:discordId', strictLimiter, (req, res) => {
  const row = db.prepare('SELECT * FROM links WHERE discord_id = ?').get(req.params.discordId);
  if (!row) return res.status(404).json({ error: 'No link found for this Discord ID' });
  res.json({ link: row });
});

// DELETE /links/:discordId - unlink
router.delete('/:discordId', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM links WHERE discord_id = ?').run(req.params.discordId);
  if (result.changes === 0) return res.status(404).json({ error: 'No link found for this Discord ID' });
  res.json({ unlinked: true });
});

module.exports = router;
