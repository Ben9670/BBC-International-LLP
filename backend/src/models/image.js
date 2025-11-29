// backend/src/models/Image.js
const { Schema, model } = require('mongoose');

const imageSchema = new Schema({
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  filenames: {
    thumb: String,
    medium: String,
    original: String
  },
  urls: {
    thumb: String,
    medium: String,
    original: String
  },
  contentType: String,
  size: Number,
  uploadedBy: { type: String, default: 'admin' },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'images' });

module.exports = model('Image', imageSchema);
