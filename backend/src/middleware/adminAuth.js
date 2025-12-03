// backend/src/middleware/adminAuth.js
const jwt = require('jsonwebtoken');

module.exports = function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';

  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid authorization format' });
  }

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // attach admin info for downstream use
    req.admin = decoded;

    // ensure it's an admin
    if (!decoded.role || decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalid or expired' });
  }
};
