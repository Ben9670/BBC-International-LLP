// backend/src/models/Product.js
const { Schema, model } = require('mongoose');

const productSchema = new Schema({
  title: { type: String, required: true, index: true },
  sku: { type: String, index: true, default: null },
  price: { type: Number, default: 0 },
  shortDesc: { type: String, default: '' },
  longDesc: { type: String, default: '' },
  images: [
    {
      imageId: { type: Schema.Types.ObjectId, ref: 'Image' },
      urls: {
        thumb: String,
        medium: String,
        original: String
      },
      title: String,
      description: String
    }
  ],
  stock: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'products' });

productSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = model('Product', productSchema);
