// backend/src/models/Quote.js
const mongoose = require('mongoose');

const QuoteSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  phone: { type: String, trim: true, default: '' },
  message: { type: String, required: true, trim: true },
  // this will store frontend timestamp or server time if not provided
  timestamp: { type: Date, default: () => new Date() },
  createdAt: { type: Date, default: () => new Date() }
}, { versionKey: false });

module.exports = mongoose.model('Quote', QuoteSchema);
