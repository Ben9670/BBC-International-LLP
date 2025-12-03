// backend/src/validators/categoryValidator.js
const { body, validationResult } = require('express-validator');

/* ------------------------ Helpers ------------------------ */

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(v);

/* ------------------------ Error formatter ------------------------ */

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array().map(err => err.msg).join(', ')
    });
  }

  next();
};

/* ------------------------ Create Validator ------------------------ */

const validateCreateCategory = [
  body('name')
    .trim()
    .notEmpty().withMessage('Category name is required')
    .isLength({ max: 120 }).withMessage('Name cannot exceed 120 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),

  // allow empty strings to be treated as absent
  body('imageUrl')
    .optional({ checkFalsy: true })
    .trim()
    .isURL().withMessage('imageUrl must be a valid URL'),

  body('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('Status must be active or inactive'),

  // NEW: optional parent validator
  body('parent')
    .optional({ nullable: true })
    .custom((val) => {
      // Accept "parent" as ObjectId string or object { id: "<objectId>" }
      if (typeof val === 'string') {
        if (!isObjectId(val)) throw new Error('parent must be a valid ObjectId string');
        return true;
      }
      if (typeof val === 'object' && val !== null) {
        if (typeof val.id === 'string' && isObjectId(val.id)) return true;
        throw new Error('parent object must include a valid id property');
      }
      throw new Error('parent must be an ObjectId string or { id: "<id>" }');
    }),

  handleValidation
];

/* ------------------------ Update Validator ------------------------ */

const validateUpdateCategory = [
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Name cannot be empty')
    .isLength({ max: 120 }).withMessage('Name cannot exceed 120 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),

  body('imageUrl')
    .optional({ checkFalsy: true })
    .trim()
    .isURL().withMessage('imageUrl must be a valid URL'),

  body('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('Status must be active or inactive'),

  // NEW: optional parent validator (same as create)
  body('parent')
    .optional({ nullable: true })
    .custom((val) => {
      if (typeof val === 'string') {
        if (!isObjectId(val)) throw new Error('parent must be a valid ObjectId string');
        return true;
      }
      if (typeof val === 'object' && val !== null) {
        if (typeof val.id === 'string' && isObjectId(val.id)) return true;
        throw new Error('parent object must include a valid id property');
      }
      throw new Error('parent must be an ObjectId string or { id: "<id>" }');
    }),

  handleValidation
];

module.exports = {
  validateCreateCategory,
  validateUpdateCategory
};
