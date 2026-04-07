import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import connectDB from './db.js';

import authRoutes     from './routes/auth.js';
import orderRoutes    from './routes/orders.js';
import driverRoutes   from './routes/drivers.js';
import paymentRoutes  from './routes/payments.js';
import userRoutes     from './routes/users.js';
import trackingRoutes from './routes/tracking.js';
import reviewRoutes   from './routes/reviews.js';
import pricingRoutes  from './routes/pricing.js';
import fleetRoutes    from './routes/fleet.js';
import settingsRoutes from './routes/settings.js';
import logsRoutes     from './routes/logs.js';
import socketHandler  from './utils/socketHandler.js';

import { noSqlSanitize, xssSanitize, hppProtect } from './middleware/sanitize.js';
import { limiters, checkBlocked, trackAbuse }      from './middleware/rateLimit.js';

// ── Validate required env vars ───────────────────────────
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET must be at least 32 characters');
  process.exit(1);
}

const app    = express();
const server = createServer(app);

// ── Allowed origins ─────────────────────────────────────
const buildOrigins = () => {
  const base = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ];
  if (process.env.FRONTEND_URL) {
    process.env.FRONTEND_URL.split(',').forEach(u => base.push(u.trim()));
  }
  return base;
};
const allowedOrigins = buildOrigins();

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);   // allow non-browser clients
    if (allowedOrigins.some(o => origin.startsWith(o))) return callback(null, true);
    if (process.env.NODE_ENV === 'production' && origin.endsWith('.vercel.app')) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
};

// ── Socket.io ───────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.some(o => origin.startsWith(o))) return callback(null, true);
      if (process.env.NODE_ENV === 'production' && origin?.endsWith('.vercel.app')) return callback(null, true);
      callback(new Error('Socket CORS blocked'));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,  // 1MB max message size
});

socketHandler(io);
app.set('io', io);

// ══════════════════════════════════════════════════════════
//  SECURITY MIDDLEWARE STACK
//  Order matters — do NOT rearrange
// ══════════════════════════════════════════════════════════

// 1. Trust proxy (Heroku, Vercel, Nginx — needed for req.ip to be real IP)
app.set('trust proxy', 1);

// 2. Helmet — security headers
app.use(helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", 'data:', 'https:'],
      connectSrc:     ["'self'", ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])],
      fontSrc:        ["'self'", 'https:', 'data:'],
      objectSrc:      ["'none'"],
      frameSrc:       ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  // HSTS — force HTTPS for 1 year (only in production)
  strictTransportSecurity: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // Prevent MIME sniffing
  noSniff: true,
  // Disable X-Powered-By
  hidePoweredBy: true,
  // XSS filter (legacy browsers)
  xssFilter: true,
  // Referrer policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Disable crossOriginEmbedderPolicy (breaks Google Maps)
  crossOriginEmbedderPolicy: false,
}));

// 3. HTTPS redirect in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// 4. CORS
app.use(cors(corsOptions));

// 5. Abuse tracker (global, before rate limiting)
app.use(checkBlocked);
app.use(trackAbuse);

// 6. Body parsing
//    IMPORTANT: webhook needs raw body BEFORE express.json() touches it
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 7. NoSQL injection sanitization (after body parse, before routes)
app.use(noSqlSanitize);

// 8. XSS sanitization
app.use(xssSanitize);

// 9. HTTP Parameter Pollution prevention
app.use(hppProtect);

// 10. General rate limit (applied globally, then stricter per-route)
app.use('/api/', limiters.general);

// ══════════════════════════════════════════════════════════
//  ROUTE-LEVEL RATE LIMITS
// ══════════════════════════════════════════════════════════
app.use('/api/auth/login',              limiters.auth);
app.use('/api/auth/register',           limiters.auth);
app.use('/api/auth/refresh',            limiters.auth);
app.use('/api/auth/change-password',    limiters.strict);
// OTP send endpoints — 5 requests per 10 min per IP
app.use('/api/auth/resend-otp',         limiters.otp);
app.use('/api/auth/forgot-password',    limiters.otp);
// OTP verify endpoints — per-record attempt limit enforced inside route handler
app.use('/api/auth/verify-otp',         limiters.otpVerify);
app.use('/api/auth/verify-reset-otp',   limiters.otpVerify);
// Reset password — strict: 5 per hour per IP
app.use('/api/auth/reset-password',     limiters.strict);
app.use('/api/payments/initialize',  limiters.payment);
app.use('/api/payments/verify',      limiters.payment);
app.use('/api/orders',               (req, res, next) => {
  if (req.method === 'POST') return limiters.mutation(req, res, next);
  next();
});
app.use('/api/drivers/jobs',         limiters.mutation);
app.use('/api/drivers/location',     limiters.location);

// ── Routes ─────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/drivers',  driverRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/reviews',  reviewRoutes);
app.use('/api/pricing',  pricingRoutes);
app.use('/api/fleet',    fleetRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/logs',     logsRoutes);

// ── Health check ────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({
  status: 'ok',
  service: 'JMove Logistics API',
  uptime: Math.floor(process.uptime()),
  environment: process.env.NODE_ENV || 'development',
  timestamp: new Date().toISOString(),
}));

// ── 404 ─────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` })
);

// ── Global error handler ────────────────────────────────
app.use((err, req, res, next) => {
  // Never leak stack traces in production
  const isProd = process.env.NODE_ENV === 'production';

  let status  = err.statusCode || 500;
  let message = err.message    || 'Internal server error';

  // Mongoose: duplicate key
  if (err.code === 11000) {
    status  = 409;
    const field = Object.keys(err.keyPattern || {})[0];
    message = field ? `${field} already exists` : 'A record with this information already exists';
  }
  // Mongoose: validation
  if (err.name === 'ValidationError') {
    status  = 400;
    message = Object.values(err.errors).map(e => e.message).join(', ');
  }
  // Mongoose: bad ObjectId
  if (err.name === 'CastError') {
    status  = 400;
    message = 'Invalid ID format';
  }
  // JWT errors (shouldn't reach here but defensive)
  if (err.name === 'JsonWebTokenError') { status = 401; message = 'Invalid token'; }
  if (err.name === 'TokenExpiredError') { status = 401; message = 'Token expired'; }

  // Log 5xx errors with full detail server-side
  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${status} ${req.method} ${req.path}:`, isProd ? err.message : err);
  }

  res.status(status).json({
    success: false,
    message,
    ...(isProd ? {} : { stack: err.stack }),
  });
});

// ── Start ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log('');
    console.log('  🚛 JMove Logistics API');
    console.log(`  🚀 Port:        ${PORT}`);
    console.log(`  🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  🔒 Security:    helmet / zod / mongo-sanitize / hpp`);
    console.log(`  ✅ MongoDB:     connected`);
    console.log(`  🏥 Health:      http://localhost:${PORT}/api/health`);
    console.log('');
  });
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
