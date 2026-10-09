const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { strictLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// POST /whitelist - add a Discord user ID to the whitelist (admin only)
router.post('/', requireAdmin, (req, res) => {
  const { discordId, note } = req.body || {};
  if (!discordId) return res.status(400).json({ error: 'discordId is required' });

  const existing = db.prepare('SELECT * FROM whitelist WHERE discord_id = ?').get(discordId);
  if (existing) return res.status(409).json({ error: 'User is already whitelisted' });

  db.prepare('INSERT INTO whitelist (discord_id, note, created_at) VALUES (?, ?, ?)')
    .run(discordId, note || null, Date.now());

  res.status(201).json({ added: true, discordId });
});

// GET /whitelist - list whitelisted users (admin only)
router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT discord_id, note, created_at FROM whitelist ORDER BY created_at DESC').all();
  res.json({ count: rows.length, whitelist: rows });
});

// GET /whitelist/:discordId - check if a user is whitelisted (public-ish, rate limited)
router.get('/:discordId', strictLimiter, (req, res) => {
  const row = db.prepare('SELECT * FROM whitelist WHERE discord_id = ?').get(req.params.discordId);
  res.json({ whitelisted: !!row });
});

// DELETE /whitelist/:discordId - remove from whitelist (admin only)
router.delete('/:discordId', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM whitelist WHERE discord_id = ?').run(req.params.discordId);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found in whitelist' });
  res.json({ removed: true });
});

module.exports = router;
