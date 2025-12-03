// backend/src/validators/productValidator.js
const Joi = require('joi');

/**
 * Middleware runner for Joi validation.
 * usage: validate(schema)
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const data = source === 'body' ? req.body : req.query;
  const { error, value } = schema.validate(data, { abortEarly: false, stripUnknown: true });
  if (error) {
    const details = error.details.map(d => ({ message: d.message, path: d.path }));
    return res.status(422).json({ success: false, errors: details });
  }
  // replace with sanitized value
  if (source === 'body') req.body = value;
  else req.query = value;
  return next();
};

const imageSchema = Joi.object({
  imageId: Joi.string().allow(null, ''),
  urls: Joi.object({
    thumb: Joi.string().allow(''),
    medium: Joi.string().allow(''),
    original: Joi.string().allow('')
  }).optional(),
  title: Joi.string().allow(''),
  description: Joi.string().allow('')
});

const variantSchema = Joi.object({
  sku: Joi.string().allow('', null),
  title: Joi.string().required(),
  price: Joi.number().min(0).default(0),
  stock: Joi.number().integer().min(0).default(0),
  attributes: Joi.object().pattern(/.*/, Joi.string())
});

const createProductSchema = Joi.object({
  title: Joi.string().required(),
  sku: Joi.string().allow(null, ''),
  price: Joi.number().min(0).default(0),
  compareAtPrice: Joi.number().min(0).default(0),
  shortDesc: Joi.string().allow(''),
  longDesc: Joi.string().allow(''),
  images: Joi.array().items(imageSchema).default([]),
  primaryImageUrl: Joi.string().uri().allow(''),
  category: Joi.string().allow(null, ''),
  tags: Joi.array().items(Joi.string()).default([]),
  attributes: Joi.object().pattern(/.*/, Joi.string()).default({}),
  variants: Joi.array().items(variantSchema).default([]),
  stock: Joi.number().integer().min(0).default(0),
  active: Joi.boolean().default(true),
  metadata: Joi.object({
    weight: Joi.number().optional(),
    dimensions: Joi.object({ w: Joi.number(), h: Joi.number(), d: Joi.number() }).optional(),
    additional: Joi.object().pattern(/.*/, Joi.string()).optional()
  }).optional()
});

const updateProductSchema = createProductSchema.fork(['title'], (s) => s.optional());

const listProductsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(20),
  sort: Joi.string().allow('', null).default('-createdAt'),
  q: Joi.string().allow('', null),
  minPrice: Joi.number().min(0).optional(),
  maxPrice: Joi.number().min(0).optional(),
  category: Joi.string().allow('', null).optional(),
  active: Joi.boolean().optional(),
  tags: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())).optional()
});

module.exports = {
  validate,
  validateCreateProduct: validate(createProductSchema, 'body'),
  validateUpdateProduct: validate(updateProductSchema, 'body'),
  validateListProducts: validate(listProductsSchema, 'query')
};
