import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load .env relative to this file's directory, not cwd
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './db.js';

import authRoutes     from './routes/auth.js';
import orderRoutes    from './routes/orders.js';
import driverRoutes   from './routes/drivers.js';
import paymentRoutes  from './routes/payments.js';
import userRoutes     from './routes/users.js';
import trackingRoutes from './routes/tracking.js';
import socketHandler  from './utils/socketHandler.js';

const app    = express();
const server = createServer(app);

// ── Socket.io ──────────────────────────────────────────────────────────────
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
});

socketHandler(io);
app.set('io', io);

// ── Security ───────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false }));
// Build allowed origins list — supports multiple comma-separated FRONTEND_URLs
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

app.use(cors({
  origin: (origin, callback) => {
    // Allow no-origin requests (curl, Postman, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o))) return callback(null, true);
    // In production allow same Vercel deployment URLs (*.vercel.app)
    if (process.env.NODE_ENV === 'production' && origin.endsWith('.vercel.app')) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15 });
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Body parsing ───────────────────────────────────────────────────────────
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/drivers',  driverRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/tracking', trackingRoutes);
app.get('/api/health', (_, res) => res.json({
  status: 'ok',
  service: 'JMove Logistics API',
  uptime: Math.floor(process.uptime()),
  environment: process.env.NODE_ENV || 'development',
  timestamp: new Date().toISOString(),
}));

// ── 404 & Error ────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` }));

app.use((err, req, res, next) => {
  let status  = err.statusCode || 500;
  let message = err.message    || 'Internal server error';
  if (err.code === 11000) { status = 409; message = 'A record with this information already exists'; }
  if (err.name === 'ValidationError') { status = 400; message = Object.values(err.errors).map(e => e.message).join(', '); }
  console.error(`[${new Date().toISOString()}] ${status}: ${message}`);
  res.status(status).json({ success: false, message });
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log('');
    console.log('  🚛 JMove Logistics API');
    console.log(`  🚀 Port: ${PORT}`);
    console.log(`  🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  ✅ MongoDB: connected`);
    console.log(`  🏥 Health: http://localhost:${PORT}/api/health`);
    console.log('');
  });
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
