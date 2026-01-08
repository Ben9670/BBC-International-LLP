// backend/src/controllers/imageController.js
const mongoose = require('mongoose');
const ImageUpload = require('../models/ImageUpload');  // ← matches your model name exactly
const Product = require('../models/Product');

function toIntOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * POST /api/images/confirm
 */
exports.confirmImage = async (req, res) => {
  try {
    const {
      key, url, contentType, productId, page, slot, role
    } = req.body;

    const size = toIntOrNull(req.body.size);
    const width = toIntOrNull(req.body.width);
    const height = toIntOrNull(req.body.height);
    const order = toIntOrNull(req.body.order);

    const title = (req.body.title || '').trim();
    const description = (req.body.description || '').trim();

    if (!key || !url) {
      return res.status(400).json({ success: false, message: 'Missing required fields: key and url' });
    }

    const imageDoc = new ImageUpload({
      title,
      description,
      filenames: {
        original: key,
        thumb: req.body.thumb || '',
        medium: req.body.medium || ''
      },
      urls: {
        original: url,
        thumb: req.body.thumbUrl || '',
        medium: req.body.mediumUrl || ''
      },
      metadata: {
        contentType: contentType || '',
        size,
        width,
        height
      },
      contentType: contentType || '',
      size,
      product: productId || null,
      productId: productId || null,
      createdBy: req.user?.id || null,
      uploadedBy: req.user?.id || 'admin',
      page: page || null,
      slot: slot || null,
      role: role || null,
      order: order ?? 0
    });

    const saved = await imageDoc.save();

    // Attach to product.images
    if (productId && mongoose.isValidObjectId(productId)) {
      const product = await Product.findById(productId);
      if (product) {
        if (!Array.isArray(product.images)) product.images = [];
        if (!product.images.some(id => String(id) === String(saved._id))) {
          product.images.push(saved._id);
          await product.save();
        }
      }
    }

    return res.status(201).json({ success: true, image: saved });
  } catch (err) {
    console.error('confirmImage error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * PATCH /api/images/:id/thumbnails
 */
exports.updateThumbnails = async (req, res) => {
  try {
    const imageId = req.params.id;

    if (!mongoose.isValidObjectId(imageId)) {
      return res.status(400).json({ ok: false, error: 'Invalid image id' });
    }

    const { thumbnails = {}, thumbnailJob = null } = req.body;

    const update = { processed: true };

    if (thumbnails.thumb) {
      update['filenames.thumb'] = thumbnails.thumb.filename || '';
      update['urls.thumb'] = thumbnails.thumb.url || '';
    }

    if (thumbnails.medium) {
      update['filenames.medium'] = thumbnails.medium.filename || '';
      update['urls.medium'] = thumbnails.medium.url || '';
    }

    if (thumbnailJob) {
      update.thumbnailJob = thumbnailJob;
      update.lastThumbnailUpdatedAt = new Date();
    }

    const updated = await ImageUpload.findByIdAndUpdate(imageId, update, { new: true });
    if (!updated) return res.status(404).json({ ok: false, error: 'Image not found' });

    return res.json({ ok: true, image: updated });
  } catch (err) {
    console.error('updateThumbnails error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};
