// backend/src/models/category.js
const mongoose = require('mongoose');
const slugify = require('slugify');

const CategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,          // keep unique constraint here
    trim: true,
    maxlength: 120
  },
  slug: {
    type: String,
    required: true,
    unique: true,          // keep unique constraint here
    lowercase: true,
    trim: true,
    maxlength: 140
  },
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: 2000
  },
  imageUrl: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },

  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

/**
 * Pre-validate hook (promise style)
 */
CategorySchema.pre('validate', function () {
  if (this.isModified('name') || !this.slug) {
    const baseSlug = slugify(this.name || '', { lower: true, strict: true }).slice(0, 130);
    this.slug = baseSlug || `${Date.now()}`;
  }
});

/**
 * Soft-delete helper
 */
CategorySchema.methods.softDelete = function () {
  this.deletedAt = new Date();
  this.status = 'inactive';
  return this.save();
};

/**
 * Static helper to find non-deleted
 */
CategorySchema.statics.activeFind = function (query = {}, projection = null, options = {}) {
  return this.find({ ...query, deletedAt: null }, projection, options);
};

module.exports = mongoose.model('Category', CategorySchema);
