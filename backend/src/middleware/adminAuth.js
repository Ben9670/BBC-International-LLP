// backend/src/middleware/adminAuth.js
module.exports = function adminAuth(req, res, next) {
  const header = (req.headers['x-admin-pass'] || req.headers['x-admin-auth'] || '').toString();
  if (!header || header !== process.env.ADMIN_PASS) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
