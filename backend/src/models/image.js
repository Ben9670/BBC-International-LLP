// backend/src/models/Image.js
const { Schema, model } = require('mongoose');

const allowablePages = ['home', 'category', 'product', 'collection', null];
const allowableRoles = ['primary', 'gallery', 'thumb', 'banner', 'hero', null];

const imageSchema = new Schema(
  {
    title: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },

    filenames: {
      thumb: { type: String, required: true },
      medium: { type: String, required: true },
      original: { type: String, required: true }
    },

    urls: {
      thumb: { type: String, required: true },
      medium: { type: String, required: true },
      original: { type: String, required: true }
    },

    contentType: String,
    size: Number,

    width: Number,
    height: Number,

    uploadedBy: { type: String, default: 'admin' },

    // association fields
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    page: { type: String, enum: allowablePages, default: null },
    slot: { type: String, default: null }, // free-form slot name like 'hero' or 'banner1'
    role: { type: String, enum: allowableRoles, default: null },
    order: { type: Number, default: 0 },

    version: { type: Number, default: 1 },   // increment for new uploads that replace same logical image
    deleted: { type: Boolean, default: false } // soft delete
  },
  {
    collection: 'images',
    timestamps: true // createdAt + updatedAt
  }
);

// Indexes for common lookups
imageSchema.index({ productId: 1 });
imageSchema.index({ page: 1, slot: 1 });
imageSchema.index({ role: 1 });

module.exports = model('Image', imageSchema);
