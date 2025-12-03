// backend/src/routes/products.js
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { connect } = require('../db');
const adminAuth = require('../middleware/adminAuth');

const productController = require('../controllers/productController');

const router = express.Router();
connect().catch(err => console.error('DB connect error:', err));

/* ---------------- common validation handler ---------------- */
const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });
  return null;
};

/* ---------------- routes ---------------- */

/**
 * GET /api/products
 */
router.get('/',
  [
    query('page').optional().toInt().isInt({ min: 1 }).withMessage('page must be >= 1'),
    query('limit').optional().toInt().isInt({ min: 1, max: 200 }).withMessage('limit must be 1-200'),
    query('q').optional().isString().trim(),
    query('minPrice').optional().isFloat({ min: 0 }),
    query('maxPrice').optional().isFloat({ min: 0 }),
    query('category').optional().isString(),
    query('category_id').optional().isString(),
    query('tags').optional().isString(),
    query('active').optional().isBoolean().toBoolean(),
    query('sort').optional().isString()
  ],
  (req, res, next) => {
    if (handleValidation(req, res)) return;
    return productController.listProducts(req, res, next);
  });

/**
 * GET /api/products/:id
 */
router.get('/:id', (req, res, next) => productController.getProduct(req, res, next));

/**
 * POST /api/products (admin)
 */
router.post('/',
  adminAuth,
  [
    body('title').optional().trim(),
    body('product_name').optional().trim(),
    body('price').optional().isFloat({ min: 0 }).withMessage('price must be >= 0'),
    body('sku').optional().trim(),
    body('product_code').optional().trim(),
    body('shortDesc').optional().trim(),
    body('short_description').optional().trim(),
    body('longDesc').optional().trim(),
    body('full_description').optional().trim(),
    body('images').optional().isArray(),
    body('images.*.urls').optional().isObject(),
    body('specifications').optional().isArray(),
    body('stock').optional().isInt({ min: 0 })
  ],
  (req, res, next) => {
    if (handleValidation(req, res)) return;
    return productController.createProduct(req, res, next);
  });

/**
 * PUT /api/products/:id (admin)
 */
router.put('/:id',
  adminAuth,
  [
    body('title').optional().trim(),
    body('product_name').optional().trim(),
    body('price').optional().isFloat({ min: 0 }),
    body('sku').optional().trim(),
    body('product_code').optional().trim(),
    body('shortDesc').optional().trim(),
    body('short_description').optional().trim(),
    body('longDesc').optional().trim(),
    body('full_description').optional().trim(),
    body('images').optional().isArray(),
    body('specifications').optional().isArray(),
    body('stock').optional().isInt({ min: 0 }),
    body('active').optional().isBoolean()
  ],
  (req, res, next) => {
    if (handleValidation(req, res)) return;
    return productController.updateProduct(req, res, next);
  });

/**
 * DELETE /api/products/:id (admin)
 */
router.delete('/:id', adminAuth, (req, res, next) => productController.deleteProduct(req, res, next));

module.exports = router;
