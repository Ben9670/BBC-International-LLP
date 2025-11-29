// backend/src/routes/products.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { connect } = require('../db'); // connect() is idempotent
const Product = require('../models/Product');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

// Ensure DB connected (safe to call multiple times)
connect().catch(err => console.error('DB connect error:', err));

/**
 * GET /api/products?page=1&limit=20&search=
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    const projection = { title: 1, price: 1, shortDesc: 1, 'images.urls.thumb': 1, sku: 1 };
    const items = await Product.find(filter)
      .select(projection)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    const total = await Product.countDocuments(filter);
    res.json({ page, limit, total, items });
  } catch (err) {
    console.error('GET /api/products', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * GET /api/products/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    const doc = await Product.findById(id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    console.error('GET /api/products/:id', err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

/**
 * POST /api/products (admin)
 */
router.post('/',
  adminAuth,
  body('title').trim().notEmpty().withMessage('title required'),
  body('price').optional().isNumeric().withMessage('price must be a number'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    try {
      const payload = req.body;
      const doc = new Product({
        title: payload.title,
        sku: payload.sku || null,
        price: payload.price || 0,
        shortDesc: payload.shortDesc || '',
        longDesc: payload.longDesc || '',
        images: payload.images || [],
        stock: payload.stock || 0
      });
      const saved = await doc.save();
      res.status(201).json({ ok: true, id: saved._id });
    } catch (err) {
      console.error('POST /api/products', err);
      res.status(500).json({ error: 'Failed to create product' });
    }
  });

/**
 * PUT /api/products/:id (admin)
 */
router.put('/:id',
  adminAuth,
  body('title').optional().trim(),
  body('price').optional().isNumeric(),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

      const updates = {};
      const allowed = ['title', 'sku', 'price', 'shortDesc', 'longDesc', 'images', 'stock'];
      for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
      updates.updatedAt = new Date();

      await Product.updateOne({ _id: id }, { $set: updates });
      res.json({ ok: true });
    } catch (err) {
      console.error('PUT /api/products/:id', err);
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

/**
 * DELETE /api/products/:id (admin)
 */
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    await Product.deleteOne({ _id: id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/products/:id', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;
