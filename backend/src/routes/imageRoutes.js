// backend/src/routes/imageRoutes.js
const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');

const adminAuth = require('../middleware/adminAuth');
const imageController = require('../controllers/imageController'); // ← matches EXACT filename

// Validation rules for confirm endpoint
const confirmRules = [
  body('key').isString().notEmpty(),
  body('url').isURL({ require_protocol: true }),
  body('productId').optional().isMongoId()
];

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });
  return null;
}

// POST /api/images/confirm
router.post(
  '/confirm',
  adminAuth,
  confirmRules,
  (req, res, next) => validate(req, res) || next(),
  imageController.confirmImage
);

// PATCH /api/images/:id/thumbnails
router.patch(
  '/:id/thumbnails',
  adminAuth,
  [param('id').isMongoId()],
  (req, res, next) => validate(req, res) || next(),
  imageController.updateThumbnails
);

module.exports = router;
