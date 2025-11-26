// backend/src/index.js
require('dotenv').config();
//log block
console.log('ENV CHECK', {
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: !!process.env.SMTP_USER,
  BUSINESS_EMAIL: !!process.env.BUSINESS_EMAIL
});
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const quoteRouter = require('./routes/quote'); // IMPORTANT: no .js extension in CJS

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// CORS
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';
app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'POST', 'OPTIONS']
}));

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger (debug)
app.use((req, res, next) => {
  console.log(`➡️  ${req.method} ${req.url}`);
  next();
});

// Global rate limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300
}));

// Quote limiter + router
app.use('/api/quote', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10
}), quoteRouter);

// Health route
app.get('/health', (req, res) => res.json({ ok: true }));

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
