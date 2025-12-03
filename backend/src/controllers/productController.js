// backend/src/controllers/productController.js
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category'); // used for optional populate/validation

/* ----------------- Helper: map product -> frontend DTO ----------------- */
function mapProductToDTO(pDoc, options = { full: false }) {
  if (!pDoc) return null;
  const p = pDoc.toObject ? pDoc.toObject() : pDoc;

  const images = (p.images || []).map(img => ({
    imageId: img.imageId || null,
    thumb: img.urls?.thumb || '',
    medium: img.urls?.medium || '',
    original: img.urls?.original || '',
    title: img.title || '',
    description: img.description || ''
  }));

  const specifications = (p.specifications || []).map(s => ({
    key: s.key || '',
    value: s.value || ''
  }));

  const dto = {
    id: p._id ? String(p._id) : null,
    product_name: p.title || '',
    product_code: p.sku || null,
    images,
    short_description: p.shortDesc || '',
    full_description: p.longDesc || '',
    specifications,
    category_id: p.category ? (typeof p.category === 'object' ? String(p.category._id || p.category) : String(p.category)) : null,
    price: p.price || 0,
    stock: p.stock || 0,
    active: typeof p.active === 'boolean' ? p.active : true,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };

  if (options.full) {
    if (p.category && typeof p.category === 'object' && (p.category._id || p.category.id)) {
      dto.category = {
        id: String(p.category._id || p.category.id),
        name: p.category.name || '',
        slug: p.category.slug || ''
      };
    }
  }

  return dto;
}

/* ----------------- createProduct ----------------- */
exports.createProduct = async (req, res, next) => {
  try {
    const payload = req.body || {};

    // Basic SKU auto-generation
    if (!payload.sku && !payload.product_code) {
      payload.sku = `SKU-${Date.now().toString(36).toUpperCase().slice(-8)}`;
    }

    const doc = new Product({
      title: payload.product_name || payload.title,
      sku: payload.product_code || payload.sku || null,
      price: payload.price || 0,
      shortDesc: payload.short_description || payload.shortDesc || '',
      longDesc: payload.full_description || payload.longDesc || '',
      images: payload.images || [],
      specifications: payload.specifications || [],
      stock: payload.stock || 0,
      category: payload.category_id || payload.category || null,
      tags: payload.tags || [],
      attributes: payload.attributes || {},
      variants: payload.variants || [],
      active: typeof payload.active === 'undefined' ? true : !!payload.active
    });

    const saved = await doc.save();

    // Return created id and mapped dto (populated category if present)
    const populated = await Product.findById(saved._id).populate('category', 'name slug').lean().exec();
    return res.status(201).json({ success: true, data: mapProductToDTO(populated, { full: true }) });
  } catch (err) {
    next(err);
  }
};

/* ----------------- getProduct (by id or slug) ----------------- */
exports.getProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const query = {};

    if (mongoose.Types.ObjectId.isValid(id)) query._id = id;
    else query.slug = id;

    const product = await Product.findOne(query).populate('category', 'name slug').lean().exec();

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    return res.json({ success: true, data: mapProductToDTO(product, { full: true }) });
  } catch (err) {
    next(err);
  }
};

/* ----------------- listProducts ----------------- */
exports.listProducts = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20, sort = '-createdAt', q, minPrice, maxPrice, category, category_id, active, tags
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (typeof active !== 'undefined') {
      filter.active = (active === 'true' || active === true);
    }

    // category filter: accept category_id or category (ObjectId)
    const catRaw = (category_id || category || '').toString().trim();
    if (catRaw) {
      if (!mongoose.Types.ObjectId.isValid(catRaw)) {
        return res.status(400).json({ success: false, message: 'Invalid category_id' });
      }
      // Use 'new' to construct ObjectId safely
      filter.category = new mongoose.Types.ObjectId(catRaw);
    }

    if (tags) {
      filter.tags = { $in: Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()).filter(Boolean) };
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    let findQuery = Product.find(filter);

    if (q) {
      findQuery = findQuery.find({ $text: { $search: q } }, { score: { $meta: 'textScore' } });
    }

    // build sort object
    const sortObj = {};
    if (typeof sort === 'string') {
      if (sort.includes(',')) {
        sort.split(',').forEach(s => {
          const [field, dir] = s.split(':').map(x => x.trim());
          sortObj[field] = dir === 'asc' ? 1 : -1;
        });
      } else if (sort.startsWith('-')) {
        sortObj[sort.slice(1)] = -1;
      } else if (sort.includes(':')) {
        const [f, d] = sort.split(':').map(x => x.trim());
        sortObj[f] = d === 'asc' ? 1 : -1;
      } else {
        sortObj[sort] = 1;
      }
    } else {
      sortObj.createdAt = -1;
    }

    // projection for list (lightweight)
    const projection = {
      title: 1, price: 1, shortDesc: 1, longDesc: 1, 'images.urls.thumb': 1, sku: 1, primaryImageUrl: 1, active: 1, createdAt: 1, slug: 1, category: 1, stock: 1, specifications: 1
    };

    if (filter.$text) {
      findQuery = findQuery.select({ score: { $meta: 'textScore' }, ...projection }).sort({ score: { $meta: 'textScore' }, ...sortObj });
    } else {
      findQuery = findQuery.select(projection).sort(sortObj);
    }

    const [items, total] = await Promise.all([
      findQuery.skip(skip).limit(limitNum).lean().exec(),
      Product.countDocuments(findQuery.getFilter ? findQuery.getFilter() : filter)
    ]);

    const mapped = items.map(d => mapProductToDTO(d, { full: false }));

    const meta = {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    };

    return res.json({ success: true, data: mapped, meta });
  } catch (err) {
    next(err);
  }
};

/* ----------------- updateProduct ----------------- */
exports.updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    // Prevent changing createdAt
    delete payload.createdAt;

    // Map frontend keys to DB fields if needed
    const allowedMapping = {
      product_name: 'title',
      title: 'title',
      product_code: 'sku',
      sku: 'sku',
      price: 'price',
      short_description: 'shortDesc',
      shortDesc: 'shortDesc',
      full_description: 'longDesc',
      longDesc: 'longDesc',
      images: 'images',
      specifications: 'specifications',
      category_id: 'category',
      category: 'category',
      stock: 'stock',
      active: 'active',
      tags: 'tags',
      attributes: 'attributes',
      variants: 'variants'
    };

    const updates = {};
    Object.keys(allowedMapping).forEach(k => {
      if (payload[k] !== undefined) updates[allowedMapping[k]] = payload[k];
    });

    updates.updatedAt = new Date();

    const product = await Product.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true }).populate('category', 'name slug').lean().exec();
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    return res.json({ success: true, data: mapProductToDTO(product, { full: true }) });
  } catch (err) {
    next(err);
  }
};

/* ----------------- deleteProduct ----------------- */
exports.deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { hard } = req.query;

    if (hard === 'true') {
      const deleted = await Product.findByIdAndDelete(id).lean().exec();
      if (!deleted) return res.status(404).json({ success: false, message: 'Product not found' });
      return res.json({ success: true, message: 'Product permanently deleted' });
    }

    const updated = await Product.findByIdAndUpdate(id, { $set: { active: false, updatedAt: new Date() } }, { new: true }).populate('category', 'name slug').lean().exec();
    if (!updated) return res.status(404).json({ success: false, message: 'Product not found' });

    return res.json({ success: true, data: mapProductToDTO(updated, { full: true }) });
  } catch (err) {
    next(err);
  }
};
