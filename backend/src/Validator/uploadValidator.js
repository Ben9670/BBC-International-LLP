// backend/src/validators/uploadValidator.js
const mongoose = require('mongoose');

const allowablePages = ['home', 'category', 'product', 'collection'];
const allowableRoles = ['primary', 'gallery', 'thumb', 'banner', 'hero'];

function requireFile(req, res, next) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
    return res.status(400).json({ error: 'Only image files allowed' });
  }
  next();
}

function validateProductIdIfPresent(req, res, next) {
  const { productId } = req.body;
  if (productId && !mongoose.Types.ObjectId.isValid(String(productId))) {
    return res.status(400).json({ error: 'Invalid productId' });
  }
  next();
}

function validatePatchBody(req, res, next) {
  const { title, description, page, slot, role, order } = req.body;
  if (title && String(title).length > 200) return res.status(400).json({ error: 'Title too long (max 200 chars)' });
  if (description && String(description).length > 2000) return res.status(400).json({ error: 'Description too long (max 2000 chars)' });
  if (page && !allowablePages.includes(String(page))) return res.status(400).json({ error: 'Invalid page value' });
  if (role && !allowableRoles.includes(String(role))) return res.status(400).json({ error: 'Invalid role value' });
  if (order && isNaN(Number(order))) return res.status(400).json({ error: 'Order must be a number' });
  next();
}

function validateIdParam(req, res, next) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ error: 'Invalid id param' });
  next();
}

module.exports = {
  requireFile,
  validateProductIdIfPresent,
  validatePatchBody,
  validateIdParam
};
