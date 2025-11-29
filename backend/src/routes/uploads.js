// backend/src/routes/uploads.js
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { connect } = require('../db');
const Image = require('../models/Image');
const Product = require('../models/Product');
const adminAuth = require('../middleware/adminAuth');
const { randomUUID } = require('crypto');
const mongoose = require('mongoose');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 } // 12MB
});

// Ensure upload base exists
const UPLOAD_BASE = path.join(process.cwd(), 'uploads', 'images');
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ensure DB connected (safe / idempotent)
connect().catch(err => console.error('DB connect error', err));

router.post('/admin/upload', adminAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Only images allowed' });

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const folder = path.join(UPLOAD_BASE, String(y), m);
    ensureDir(folder);

    const id = randomUUID();
    const ext = (path.extname(req.file.originalname) || '.jpg').toLowerCase();
    const baseName = `${id}`;

    const thumbRel = path.join('uploads', 'images', String(y), m, `${baseName}-thumb${ext}`);
    const mediumRel = path.join('uploads', 'images', String(y), m, `${baseName}-medium${ext}`);
    const origRel = path.join('uploads', 'images', String(y), m, `${baseName}-orig${ext}`);

    const thumbPath = path.join(process.cwd(), thumbRel);
    const mediumPath = path.join(process.cwd(), mediumRel);
    const origPath = path.join(process.cwd(), origRel);

    // write files (sharp handles buffer)
    await Promise.all([
      sharp(req.file.buffer).resize({ width: 300, withoutEnlargement: true }).toFile(thumbPath),
      sharp(req.file.buffer).resize({ width: 1024, withoutEnlargement: true }).toFile(mediumPath),
      sharp(req.file.buffer).toFile(origPath)
    ]);

    const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const urls = {
      thumb: `${appUrl}/${thumbRel.replace(/\\/g, '/')}`,
      medium: `${appUrl}/${mediumRel.replace(/\\/g, '/')}`,
      original: `${appUrl}/${origRel.replace(/\\/g, '/')}`
    };

    // create meta doc
    const meta = new Image({
      title: req.body.title || req.file.originalname,
      description: req.body.description || '',
      filenames: { thumb: thumbRel, medium: mediumRel, original: origRel },
      urls,
      contentType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.headers['x-admin-user'] || 'admin',
      productId: req.body.productId && mongoose.Types.ObjectId.isValid(req.body.productId)
        ? mongoose.Types.ObjectId(req.body.productId) : null
    });

    const saved = await meta.save();

    // attach to product if requested
    if (meta.productId) {
      await Product.updateOne(
        { _id: meta.productId },
        { $push: { images: { imageId: saved._id, urls: meta.urls, title: meta.title, description: meta.description } } }
      );
    }

    res.status(201).json({ ok: true, id: saved._id, meta });
  } catch (err) {
    console.error('Upload error', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

module.exports = router;
