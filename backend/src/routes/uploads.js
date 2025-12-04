// backend/src/routes/uploads.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { connect } = require('../db');
const adminAuth = require('../middleware/adminAuth');
const uploadsController = require('../controllers/uploadsController');
const validators = require('../Validator/uploadValidator');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 } // 12MB
});

// Ensure upload base exists (same as controller expectation)
const UPLOAD_BASE = path.join(process.cwd(), 'uploads', 'images');
if (!fs.existsSync(UPLOAD_BASE)) fs.mkdirSync(UPLOAD_BASE, { recursive: true });

// Ensure DB connected (safe / idempotent)
connect().catch(err => console.error('DB connect error', err));

/**
 * Routes
 */

// Upload image
router.post(
  '/admin/upload',
  adminAuth,
  upload.single('image'),
  validators.requireFile,
  validators.validateProductIdIfPresent,
  uploadsController.uploadImage
);

// Patch metadata
router.patch(
  '/admin/upload/:id',
  adminAuth,
  validators.validateIdParam,
  validators.validatePatchBody,
  uploadsController.patchImage
);

// Detach image from products (keeps file + doc)
router.post(
  '/admin/upload/:id/detach',
  adminAuth,
  validators.validateIdParam,
  uploadsController.detachImage
);

// Delete image (files + doc + product refs)
router.delete(
  '/admin/upload/:id',
  adminAuth,
  validators.validateIdParam,
  uploadsController.deleteImage
);

module.exports = router;
