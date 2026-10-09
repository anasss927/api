const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { strictLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// POST /admin/login - exchange ADMIN_SECRET for a short-lived JWT
router.post('/login', strictLimiter, (req, res) => {
  const { secret } = req.body || {};
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Invalid admin secret' });
  }

  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, expiresIn: '12h' });
});

// GET /admin/stats - basic stats (admin only)
router.get('/stats', requireAdmin, (req, res) => {
  const now = Date.now();

  const totalKeys = db.prepare('SELECT COUNT(*) AS c FROM keys').get().c;
  const activeKeys = db.prepare(`
    SELECT COUNT(*) AS c FROM keys
    WHERE revoked = 0
      AND uses < max_uses
      AND (expires_at IS NULL OR expires_at > ?)
  `).get(now).c;
  const revokedKeys = db.prepare('SELECT COUNT(*) AS c FROM keys WHERE revoked = 1').get().c;
  const expiredKeys = db.prepare('SELECT COUNT(*) AS c FROM keys WHERE expires_at IS NOT NULL AND expires_at <= ?').get(now).c;
  const whitelistedUsers = db.prepare('SELECT COUNT(*) AS c FROM whitelist').get().c;
  const totalLinks = db.prepare('SELECT COUNT(*) AS c FROM links').get().c;
  const pendingRequests = db.prepare("SELECT COUNT(*) AS c FROM access_requests WHERE status = 'pending'").get().c;

  res.json({
    totalKeys,
    activeKeys,
    revokedKeys,
    expiredKeys,
    whitelistedUsers,
    totalLinks,
    pendingRequests,
  });
});

module.exports = router;
