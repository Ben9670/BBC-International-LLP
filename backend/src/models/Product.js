// backend/src/models/Product.js
const { Schema, model } = require('mongoose');
const slugify = require('slugify');

const imageSubSchema = new Schema({
  imageId: { type: Schema.Types.ObjectId, ref: 'Image', default: null },
  urls: {
    thumb: { type: String, default: '' },
    medium: { type: String, default: '' },
    original: { type: String, default: '' }
  },
  title: { type: String, default: '' },
  description: { type: String, default: '' }
}, { _id: false });

const variantSchema = new Schema({
  sku: { type: String, default: null },
  title: { type: String },
  price: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  attributes: { type: Map, of: String }
}, { _id: false });

const specificationSchema = new Schema({
  key: { type: String, default: '' },
  value: { type: String, default: '' }
}, { _id: false });

const productSchema = new Schema({
  title: { type: String, required: true, index: true },            // frontend: product_name
  slug: { type: String, index: true, unique: true, sparse: true },
  sku: { type: String, index: true, default: null },               // frontend: product_code
  price: { type: Number, default: 0, index: true },
  compareAtPrice: { type: Number, default: 0 },
  shortDesc: { type: String, default: '' },                        // frontend: short_description
  longDesc: { type: String, default: '' },                         // frontend: full_description
  images: [imageSubSchema],
  primaryImageUrl: { type: String, default: '' },
  category: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
  tags: [{ type: String, index: true }],
  attributes: { type: Map, of: String },
  variants: [variantSchema],
  specifications: [specificationSchema],                            // frontend: specifications[]
  stock: { type: Number, default: 0 },
  active: { type: Boolean, default: true, index: true },
  metadata: {
    weight: { type: Number },
    dimensions: {
      w: Number, h: Number, d: Number
    },
    additional: { type: Map, of: String }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'products' });

// text index
productSchema.index({
  title: 'text',
  shortDesc: 'text',
  longDesc: 'text',
  tags: 'text'
}, {
  weights: { title: 10, shortDesc: 5, longDesc: 2, tags: 3 },
  name: 'ProductTextIndex'
});

/**
 * Pre-save hook (promise-style): do NOT accept or call `next`.
 */
productSchema.pre('save', function () {
  // keep updatedAt fresh
  this.updatedAt = new Date();

  // create slug if not present
  if (!this.slug && this.title) {
    this.slug = slugify(this.title, { lower: true, strict: true, trim: true }).slice(0, 120);
  }

  // ensure primaryImageUrl uses first image if available
  if ((!this.primaryImageUrl || this.primaryImageUrl === '') && Array.isArray(this.images) && this.images.length) {
    this.primaryImageUrl = (this.images[0] && (this.images[0].urls?.medium || this.images[0].urls?.original)) || '';
  }

  // do not call next()
});

module.exports = model('Product', productSchema);
