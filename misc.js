const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { standardLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// GET /health - basic health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// POST /apply - submit a simple access request
router.post('/apply', standardLimiter, (req, res) => {
  const { discordId, username, reason } = req.body || {};
  if (!discordId) return res.status(400).json({ error: 'discordId is required' });

  db.prepare(`
    INSERT INTO access_requests (discord_id, username, reason, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(discordId, username || null, reason || null, Date.now());

  res.status(201).json({ submitted: true });
});

// GET /apply - list access requests (admin only)
router.get('/apply', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM access_requests ORDER BY created_at DESC').all();
  res.json({ count: rows.length, requests: rows });
});

// PATCH /apply/:id - approve or reject a request (admin only)
router.patch('/apply/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'status must be one of: approved, rejected, pending' });
  }

  const result = db.prepare('UPDATE access_requests SET status = ? WHERE id = ?').run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Request not found' });
  res.json({ updated: true, status });
});

module.exports = router;
