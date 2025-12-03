// backend/src/routes/categoryRoutes.js

const express = require('express');
const router = express.Router();

// Controllers
const categoryController = require('../controllers/categorycontroller');

// Middlewares
const authMiddleware = require('../middleware/authMiddleware'); 
const adminOnly = require('../middleware/adminOnly');

// Validators
const {
  validateCreateCategory,
  validateUpdateCategory
} = require('../Validator/categoryValidator');

/* -------------------------------------------------------------
   CATEGORY ROUTES
   Base Route: /api/categories
-------------------------------------------------------------- */

/* ------------------------ Public Routes ------------------------ */

// GET all categories (paginated, searchable)
router.get('/', categoryController.getAllCategories);

// GET single category by ID or slug
router.get('/:idOrSlug', categoryController.getCategoryByIdOrSlug);


/* ------------------------ Admin Routes ------------------------ */

// CREATE new category
router.post(
  '/',
  authMiddleware,
  adminOnly,
  validateCreateCategory,
  categoryController.createCategory
);

// UPDATE category by ID
router.put(
  '/:id',
  authMiddleware,
  adminOnly,
  validateUpdateCategory,
  categoryController.updateCategory
);

// DELETE category (soft delete)
router.delete(
  '/:id',
  authMiddleware,
  adminOnly,
  categoryController.deleteCategory
);

// UPDATE status (active/inactive)
router.patch(
  '/:id/status',
  authMiddleware,
  adminOnly,
  categoryController.setCategoryStatus
);

module.exports = router;
