// backend/src/index.js
require('dotenv').config();

console.log('ENV CHECK', {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  FRONTEND_URL: !!process.env.FRONTEND_URL,
  SMTP_HOST: !!process.env.SMTP_HOST,
  SMTP_USER: !!process.env.SMTP_USER,
  BUSINESS_EMAIL: !!process.env.BUSINESS_EMAIL,
  MONGO_URI: !!process.env.MONGO_URI
});

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// optional compression — will not crash if missing
let compression;
try {
  compression = require('compression');
  console.log('🔧 compression module loaded');
} catch (e) {
  console.log('ℹ️ compression not installed — skipping');
}

const { connect, disconnect } = require('./db');
const quoteRouter = require('./routes/quote');

const app = express(); // single app instance
const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

/* ---------- basic setup ---------- */
if (process.env.TRUST_PROXY === 'true' || NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
if (NODE_ENV === 'production' && helmet && helmet.hsts) {
  app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
}

if (compression) {
  app.use(compression());
  console.log('🚀 compression middleware enabled');
}

/* ---------- parsers ---------- */
// body parsers placed early so downstream middleware/handlers can use req.body
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

/* ---------- CORS debugging (must run BEFORE cors middleware) ---------- */
app.use((req, res, next) => {
  if (req.headers.origin) {
    console.log('🌐 Incoming Origin:', req.headers.origin);
  }
  next();
});

/* ---------- CORS ---------- */
const frontendEnv = process.env.FRONTEND_URL || 'http://localhost:5500';
const allowedOrigins = frontendEnv.split(',').map(s => s.trim()).filter(Boolean);
console.log('Allowed origins:', allowedOrigins);

const corsOptions = {
  origin: (origin, callback) => {
    // allow non-browser requests (no origin header)
    if (!origin) return callback(null, true);

    // allow exact matches
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // log and soft-reject for debugging/visibility
    console.warn('⛔ Blocked CORS request from origin:', origin);
    return callback(null, false); // browser will block, server will still process the request
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

/* ---------- optional: convert cors errors to 403 JSON (if you later choose to throw) ----------
   If you switch to callback(new Error('CORS policy...')) in corsOptions, enable this middleware.
   For now it will not be triggered because we soft-reject.
*/
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes('CORS policy')) {
    return res.status(403).json({ error: 'CORS policy: origin not allowed' });
  }
  next(err);
});

/* ---------- request logging (toggle) ---------- */
if (process.env.REQUEST_LOG !== 'false') {
  app.use((req, res, next) => {
    console.log(`➡️  ${req.method} ${req.originalUrl}`);
    next();
  });
}

/* ---------- rate limiting ---------- */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
const quoteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);

/* ---------- routes ---------- */
app.use('/api/quote', quoteLimiter, quoteRouter);

function tryMount(relativePath, mountPath, name) {
  try {
    const mod = require(relativePath);
    app.use(mountPath, mod);
    console.log(`✅ Mounted ${name} at ${mountPath}`);
    return true;
  } catch (err) {
    console.error(`ℹ️ ${name} failed to load: ${relativePath}`);
    console.error(err && (err.stack || err.message || err));
    return false;
  }
}

tryMount('./routes/products', '/api/products', 'products router');
tryMount('./routes/uploads', '/api', 'uploads router (contains /admin/upload)');

/* ---------- static uploads ---------- */
const uploadsPath = path.join(process.cwd(), 'uploads');
if (fs.existsSync(uploadsPath)) {
  app.use('/uploads', express.static(uploadsPath, { maxAge: '7d' }));
  console.log(`✅ Static /uploads served from ${uploadsPath}`);
} else {
  console.log('ℹ️ uploads directory not found yet. Static serving will be enabled once /uploads exists.');
}

/* ---------- health, 404, error ---------- */
app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// generic error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && (err.stack || err));
  if (res.headersSent) return next(err);
  const status = err && err.status && Number(err.status) >= 400 ? Number(err.status) : 500;
  const payload = { error: status === 500 ? 'Internal server error' : (err.message || 'Error') };
  res.status(status).json(payload);
});

/* ---------- start server after DB connect ---------- */
let server;
async function start() {
  try {
    await connect(); // connect DB before listening
    server = app.listen(PORT, () => {
      console.log(`🚀 Backend running on port ${PORT} (pid ${process.pid})`);
    });
  } catch (err) {
    console.error('Failed to start server due to DB connection error:', err && (err.stack || err.message || err));
    process.exit(1);
  }
}
start();

/* ---------- graceful shutdown ---------- */
async function shutdown(signal) {
  try {
    console.log(`${signal} received — shutting down gracefully...`);
    if (server && server.close) {
      await new Promise(resolve => server.close(resolve));
    }
    try {
      await disconnect();
    } catch (e) {
      console.log('ℹ️ disconnect() error', e && e.message);
    }
    console.log('Shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err && (err.stack || err));
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err && (err.stack || err));
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
  process.exit(1);
});
