// backend/src/index.js
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

let compression;
try {
  compression = require('compression');
  console.log('🔧 compression module loaded');
} catch (e) {}

const { connect, disconnect } = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('ENV CHECK', {
  NODE_ENV,
  PORT,
  FRONTEND_URL: !!process.env.FRONTEND_URL,
  MONGO_URI: !!process.env.MONGO_URI,
  REQUEST_LOG: process.env.REQUEST_LOG !== 'false'
});

if (process.env.TRUST_PROXY === 'true' || NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
if (NODE_ENV === 'production' && helmet && helmet.hsts) {
  app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
}
if (compression) app.use(compression());

app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: true }));

const frontendEnv = process.env.FRONTEND_URL || 'http://localhost:5500';
const allowedOrigins = frontendEnv.split(',').map(s => s.trim()).filter(Boolean);
console.log('Allowed origins:', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
}));

app.use((err, req, res, next) => {
  if (err && /CORS|Not allowed by CORS/i.test(err.message || '')) {
    return res.status(403).json({ error: 'CORS policy: origin not allowed' });
  }
  next(err);
});

if (process.env.REQUEST_LOG !== 'false' && NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`➡️  ${req.method} ${req.originalUrl}`);
    next();
  });
}

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_GLOBAL) || 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

/* Ensure uploads directory layout exists:
   - uploads/
   - uploads/original, uploads/medium, uploads/thumb (legacy support)
   - uploads/images/YYYY/MM/{original,medium,thumb}
*/
(function ensureUploadsLayout() {
  try {
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });

    ['original', 'medium', 'thumb'].forEach(d => {
      const p = path.join(uploadsRoot, d);
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    });

    const imagesBase = path.join(uploadsRoot, 'images');
    if (!fs.existsSync(imagesBase)) fs.mkdirSync(imagesBase, { recursive: true });

    const now = new Date();
    const YYYY = String(now.getFullYear());
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const imgYearMonthDir = path.join(imagesBase, YYYY, MM);
    ['original', 'medium', 'thumb'].forEach(s => {
      const p = path.join(imgYearMonthDir, s);
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    });

    console.log('✅ Ensured uploads layout at', imgYearMonthDir);
  } catch (err) {
    console.error('Failed to ensure uploads directories:', err && (err.stack || err.message || err));
  }
})();

function mountRoutes(mounts = []) {
  mounts.forEach(m => {
    try {
      const mod = require(m.path);
      if (m.middleware) app.use(m.mountPath, m.middleware, mod);
      else app.use(m.mountPath, mod);
      console.log(`✅ Mounted ${m.name} at ${m.mountPath}`);
    } catch (err) {
      console.error(`Failed to load ${m.name}: ${m.path}`, err && (err.stack || err.message || err));
    }
  });
}

const routeMounts = [
  { path: './routes/quote', mountPath: '/api/quote', name: 'quote router', middleware: rateLimit({ windowMs: 60*60*1000, max: 10 }) },
  { path: './routes/products', mountPath: '/api/products', name: 'products router' },
  { path: './routes/uploads', mountPath: '/api/uploads', name: 'uploads router' },
  { path: './routes/categoryRoutes', mountPath: '/api/categories', name: 'categories router' },
  { path: './routes/authRoutes', mountPath: '/api/auth', name: 'auth router' }
];

mountRoutes(routeMounts);

const uploadsRoot = path.join(process.cwd(), 'uploads');
if (fs.existsSync(uploadsRoot)) {
  app.use('/uploads', express.static(uploadsRoot, {
    maxAge: NODE_ENV === 'production' ? '7d' : 0,
    index: false,
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'svg']
  }));
  console.log('✅ Static /uploads served from', uploadsRoot);
} else {
  console.log('ℹ️ No uploads directory to serve yet.');
}

app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && (err.stack || err.message || err));
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

let server;
async function start() {
  try {
    await connect();
    server = app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT} (pid ${process.pid})`));
  } catch (err) {
    console.error('Failed to start server due to DB error:', err && (err.stack || err.message || err));
    process.exit(1);
  }
}
start();

async function shutdown(signal) {
  try {
    console.log(`${signal} received — shutting down...`);
    if (server) await new Promise(resolve => server.close(resolve));
    await disconnect().catch(() => {});
    console.log('Shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err && (err.stack || err.message || err));
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err && (err.stack || err.message || err));
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
  process.exit(1);
});
