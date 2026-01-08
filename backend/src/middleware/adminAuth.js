// backend/src/middleware/adminAuth.js
require('dotenv').config();
const jwt = require('jsonwebtoken');

const ACCESS_JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'dev_secret';
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'token';

module.exports = function adminAuth(req, res, next) {
  try {
    // Try cookie first
    let token = (req.cookies && req.cookies[COOKIE_NAME]) || null;

    // Fallback to Authorization header
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      // No token found
      return res.status(401).json({ message: 'Authorization token missing' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, ACCESS_JWT_SECRET);
    } catch (verr) {
      if (verr && verr.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token expired' });
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (!decoded || decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Admin role required' });
    }

    // attach canonical user info
    req.user = { id: decoded.id, email: decoded.email, role: decoded.role };
    res.locals.user = req.user;
    return next();
  } catch (err) {
    console.error('[adminAuth] unexpected error', err && (err.stack || err.message));
    return res.status(500).json({ message: 'Internal server error in auth' });
  }
};
