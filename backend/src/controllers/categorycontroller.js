// backend/src/controllers/categoryController.js
const Category = require('../models/Category');
const slugify = require('slugify');

/* ---------------------- Small helpers ---------------------- */

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(v);

const makeSlug = (name) =>
  slugify((name || '').trim(), { lower: true, strict: true }).slice(0, 130) || `${Date.now()}`;

const pickAllowed = (source = {}, allowed = []) => {
  const out = {};
  allowed.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(source, k)) {
      out[k] = typeof source[k] === 'string' ? source[k].trim() : source[k];
    }
  });
  return out;
};

const buildBaseFilter = ({ q = '', status = 'active' } = {}) => {
  const filter = { deletedAt: null };
  const s = (status || 'active').toLowerCase();
  if (s === 'active' || s === 'inactive') filter.status = s;
  if (q && typeof q === 'string') {
    const escaped = q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    filter.$or = [{ name: rx }, { description: rx }];
  }
  return filter;
};

/* ---------------------- DTO mappers ---------------------- */

/**
 * Map a Category DB object/doc to a safe DTO for API responses
 * @param {Object} doc - mongoose doc or plain object
 */
function mapCategoryToDTO(doc) {
  if (!doc) return null;
  const c = doc.toObject ? doc.toObject() : doc;

  // Normalize parent:
  let parent = null;
  if (c.parent) {
    // Case A: populated parent as object with _id and name/slug
    if (typeof c.parent === 'object' && (c.parent._id || c.parent.id) && (c.parent.name || c.parent.slug)) {
      parent = {
        id: c.parent._id ? String(c.parent._id) : (c.parent.id ? String(c.parent.id) : null),
        name: c.parent.name || c.parent.title || '',
        slug: c.parent.slug || ''
      };
    } else {
      // Case B: unpopulated parent (ObjectId) or string -> return id string
      parent = String(c.parent);
    }
  }

  return {
    id: c._id ? String(c._id) : null,
    name: c.name || c.title || '',
    slug: c.slug || '',
    description: c.description || '',
    imageUrl: c.imageUrl || '',
    parent,
    status: c.status || 'active',
    metadata: c.metadata || {},
    deletedAt: c.deletedAt || null,
    createdAt: c.createdAt || null,
    updatedAt: c.updatedAt || null
  };
}

/**
 * Map incoming DTO (req.body) to a DB-ready object.
 * Strips unknown fields and sanitizes inputs.
 * Supports clearing parent with `parent: null`.
 */
function mapDTOToCategory(dto = {}) {
  const out = {};

  if (typeof dto.name === 'string' && dto.name.trim().length) out.name = dto.name.trim();
  if (typeof dto.description === 'string') out.description = dto.description.trim();
  if (typeof dto.imageUrl === 'string') out.imageUrl = dto.imageUrl.trim();

  // Allow clearing parent with explicit null
  if (dto.parent === null) {
    out.parent = null;
  } else if (dto.parent) {
    // Accept parent as ObjectId string or nested object { id: '...' }
    if (typeof dto.parent === 'string' && isObjectId(dto.parent)) {
      out.parent = dto.parent;
    } else if (typeof dto.parent === 'object' && dto.parent.id && isObjectId(dto.parent.id)) {
      out.parent = dto.parent.id;
    }
  }

  if (dto.slug && typeof dto.slug === 'string' && dto.slug.trim().length) {
    out.slug = makeSlug(dto.slug);
  } else if (out.name) {
    out.slug = makeSlug(out.name);
  }

  if (dto.metadata && typeof dto.metadata === 'object') out.metadata = dto.metadata;

  if (dto.status && (dto.status === 'active' || dto.status === 'inactive')) out.status = dto.status;

  return out;
}

/* ---------------------- DB error formatter ---------------------- */

function handleDbError(err, res) {
  if (!err) return res.status(500).json({ success: false, message: 'Server error' });

  if (err.code === 11000) {
    const key = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ success: false, message: `${key} already exists.` });
  }

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(', ') });
  }

  console.error('Category controller error:', err);
  return res.status(500).json({ success: false, message: 'Server error' });
}

/* ---------------------- async wrapper ---------------------- */

const asyncHandler = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => handleDbError(err, res));

/* ---------------------- Controller actions ---------------------- */

/**
 * POST /api/categories  (admin)
 */
const createCategory = asyncHandler(async (req, res) => {
  const incoming = req.body || {};
  const dto = mapDTOToCategory(incoming);

  if (!dto.name || typeof dto.name !== 'string' || dto.name.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Name is required' });
  }

  const category = new Category({
    name: dto.name,
    slug: dto.slug || makeSlug(dto.name),
    description: dto.description || '',
    imageUrl: dto.imageUrl || '',
    parent: typeof dto.parent !== 'undefined' ? dto.parent : null,
    status: dto.status || 'active',
    metadata: dto.metadata || {}
  });

  const saved = await category.save();

  // populate parent field so returned DTO includes parent.name/slug when available
  let populated = saved;
  try {
    populated = await saved.populate('parent', 'name slug');
  } catch (e) {
    populated = saved;
  }

  return res.status(201).json({ success: true, data: mapCategoryToDTO(populated) });
});

/**
 * GET /api/categories  (public)
 * Query: page, limit, q, status, sort
 */
const getAllCategories = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 200);
  const skip = (page - 1) * limit;
  const q = (req.query.q || '').trim();
  const status = req.query.status || 'active';
  const sort = req.query.sort || '-createdAt';

  const filter = buildBaseFilter({ q, status });

  const [items, total] = await Promise.all([
    Category.find(filter).sort(sort).skip(skip).limit(limit).populate('parent', 'name slug').lean().exec(),
    Category.countDocuments(filter)
  ]);

  const dtoItems = items.map(mapCategoryToDTO);

  return res.json({
    success: true,
    data: dtoItems,
    meta: { total, page, pages: Math.ceil(total / limit), limit }
  });
});

/**
 * GET /api/categories/:idOrSlug  (public)
 */
const getCategoryByIdOrSlug = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  if (!idOrSlug) return res.status(400).json({ success: false, message: 'Missing id or slug' });

  const query = isObjectId(idOrSlug)
    ? { _id: idOrSlug, deletedAt: null }
    : { slug: idOrSlug.toLowerCase(), deletedAt: null };

  const category = await Category.findOne(query).populate('parent', 'name slug').lean().exec();
  if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

  return res.json({ success: true, data: mapCategoryToDTO(category) });
});

/**
 * PUT /api/categories/:id  (admin)
 */
const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id || !isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

  const incoming = pickAllowed(req.body, ['name', 'description', 'imageUrl', 'status', 'parent', 'slug', 'metadata']);
  // map DTO -> DB-friendly
  const dtoUpdates = mapDTOToCategory(incoming);
  if (dtoUpdates.name) dtoUpdates.slug = dtoUpdates.slug || makeSlug(dtoUpdates.name);

  const updated = await Category.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: dtoUpdates },
    { new: true, runValidators: true }
  ).populate('parent', 'name slug').lean().exec();

  if (!updated) return res.status(404).json({ success: false, message: 'Category not found or deleted' });

  // Add cache invalidation here if used

  return res.json({ success: true, data: mapCategoryToDTO(updated) });
});

/**
 * DELETE /api/categories/:id  (admin) - soft delete
 */
const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id || !isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

  const category = await Category.findOne({ _id: id, deletedAt: null }).exec();
  if (!category) return res.status(404).json({ success: false, message: 'Category not found or already deleted' });

  // Prefer model's softDelete helper if present, otherwise set deletedAt
  if (typeof category.softDelete === 'function') {
    await category.softDelete();
  } else {
    category.deletedAt = new Date();
    category.status = 'inactive';
    await category.save();
  }

  // Add cache invalidation here if used

  return res.json({ success: true, message: 'Category deleted (soft)' });
});

/**
 * PATCH /api/categories/:id/status  (admin)
 */
const setCategoryStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  if (!id || !isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid id' });
  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be active or inactive' });
  }

  const updated = await Category.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { status } },
    { new: true }
  ).lean().exec();

  if (!updated) return res.status(404).json({ success: false, message: 'Category not found or deleted' });

  // Add cache invalidation here if used

  return res.json({ success: true, data: mapCategoryToDTO(updated) });
});

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryByIdOrSlug,
  updateCategory,
  deleteCategory,
  setCategoryStatus
};
