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

// optional compression
let compression;
try {
  compression = require('compression');
  console.log('🔧 compression module loaded');
} catch (e) {
  console.log('ℹ️ compression not installed — skipping');
}

const { connect, disconnect } = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

/* ---------- trust proxy ---------- */
if (process.env.TRUST_PROXY === 'true' || NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

/* ---------- security & compression ---------- */
app.use(helmet());
if (NODE_ENV === 'production' && helmet && helmet.hsts) {
  app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
}
if (compression) {
  app.use(compression());
  console.log('🚀 compression middleware enabled');
}

/* ---------- parsers ---------- */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

/* ---------- CORS debugging ---------- */
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
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);

    console.warn('⛔ Blocked CORS request from:', origin);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

/* ---------- optional: CORS error handler ---------- */
app.use((err, req, res, next) => {
  if (err && err.message.includes('CORS')) {
    return res.status(403).json({ error: 'CORS policy: origin not allowed' });
  }
  next(err);
});

/* ---------- request logging ---------- */
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

/* ================================================================
   ROUTE MOUNTS — CLEAN & MINIMAL
   Only actual routes you have: quote, products, uploads, categories
================================================================ */

function mountRoutes(mounts = []) {
  mounts.forEach((m) => {
    try {
      const mod = require(m.path);
      if (m.middleware) {
        app.use(m.mountPath, m.middleware, mod);
      } else {
        app.use(m.mountPath, mod);
      }
      console.log(`✅ Mounted ${m.name} at ${m.mountPath}`);
    } catch (err) {
      console.error(`ℹ️ Failed to load ${m.name}: ${m.path}`);
      console.error(err && (err.stack || err.message || err));
    }
  });
}

const routeMounts = [
  { path: './routes/quote', mountPath: '/api/quote', name: 'quote router', middleware: quoteLimiter },
  { path: './routes/products', mountPath: '/api/products', name: 'products router' },
  { path: './routes/uploads', mountPath: '/api', name: 'uploads router' },
  { path: './routes/categoryRoutes', mountPath: '/api/categories', name: 'categories router' },
  { path: './routes/authRoutes', mountPath: '/api/auth', name: 'auth router' }

];

mountRoutes(routeMounts);

/* ---------- static uploads ---------- */
const uploadsPath = path.join(process.cwd(), 'uploads');
if (fs.existsSync(uploadsPath)) {
  app.use('/uploads', express.static(uploadsPath, { maxAge: '7d' }));
  console.log(`✅ Static /uploads served from ${uploadsPath}`);
} else {
  console.log('ℹ️ No uploads directory yet');
}

/* ---------- health, 404, errors ---------- */
app.get('/health', (req, res) => res.json({ ok: true }));

// fallback 404 for /api routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

/* ---------- start server after DB connect ---------- */
let server;
async function start() {
  try {
    await connect();
    server = app.listen(PORT, () =>
      console.log(`🚀 Backend running on port ${PORT} (pid ${process.pid})`)
    );
  } catch (err) {
    console.error('Failed to start server due to DB error:', err);
    process.exit(1);
  }
}
start();

/* ---------- graceful shutdown ---------- */
async function shutdown(signal) {
  try {
    console.log(`${signal} received — shutting down...`);
    if (server) await new Promise(resolve => server.close(resolve));
    await disconnect().catch(() => {});
    console.log('Shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
  process.exit(1);
});
