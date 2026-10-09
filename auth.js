const jwt = require('jsonwebtoken');

// Accepts either:
//   X-Admin-Secret: <ADMIN_SECRET>
// or
//   Authorization: Bearer <JWT issued by /admin/login>
function requireAdmin(req, res, next) {
  const providedSecret = req.header('X-Admin-Secret');
  if (providedSecret && providedSecret === process.env.ADMIN_SECRET) {
    req.admin = { via: 'secret' };
    return next();
  }

  const authHeader = req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.admin = { via: 'jwt', ...payload };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAdmin };
