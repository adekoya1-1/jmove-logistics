/**
 * ─────────────────────────────────────────────────────────
 *  PRODUCTION-GRADE RATE LIMITING + ABUSE PROTECTION
 *
 *  Tiers:
 *    auth      → 10 req / 15 min  (brute-force protection)
 *    payment   → 20 req / 15 min
 *    mutation  → 60 req / 15 min  (POST/PUT/DELETE on orders)
 *    general   → 200 req / 15 min (read endpoints)
 *    strict    → 5 req / hour     (password reset, etc.)
 *
 *  Features:
 *    - IP-based tracking
 *    - Standard rate-limit headers (RateLimit-*)
 *    - Detailed logging of repeated abuse
 *    - Automatic IP block after threshold (in-memory)
 * ─────────────────────────────────────────────────────────
 */
import rateLimit from 'express-rate-limit';

// ── Abuse tracker (in-memory; for Redis use ioredis store) ──
const BLOCK_THRESHOLD = 5;   // consecutive 429s before soft-block
const BLOCK_DURATION  = 30 * 60 * 1000; // 30 min block
const abuseLog = new Map();  // ip → { count, blockedUntil }

const checkBlocked = (req, res, next) => {
  const ip    = req.ip;
  const entry = abuseLog.get(ip);
  if (entry?.blockedUntil && Date.now() < entry.blockedUntil) {
    const remaining = Math.ceil((entry.blockedUntil - Date.now()) / 60000);
    return res.status(429).json({
      success: false,
      message: `Too many requests. IP temporarily blocked for ${remaining} more minute(s).`,
    });
  }
  next();
};

const trackAbuse = (req, res, next) => {
  const onFinish = () => {
    if (res.statusCode === 429) {
      const ip    = req.ip;
      const entry = abuseLog.get(ip) || { count: 0 };
      entry.count++;
      if (entry.count >= BLOCK_THRESHOLD) {
        entry.blockedUntil = Date.now() + BLOCK_DURATION;
        console.warn(`[Security] IP ${ip} soft-blocked after ${entry.count} rate-limit hits`);
      }
      abuseLog.set(ip, entry);
    } else if (res.statusCode < 400) {
      // Reset on successful request
      const ip = req.ip;
      if (abuseLog.has(ip)) { const e = abuseLog.get(ip); if (!e.blockedUntil) abuseLog.delete(ip); }
    }
    res.removeListener('finish', onFinish);
  };
  res.on('finish', onFinish);
  next();
};

// ── Limiter factory ──────────────────────────────────────
const make = ({ windowMs, max, message, name }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    keyGenerator:    (req) => req.ip,
    handler: (req, res) => {
      console.warn(`[RateLimit:${name}] IP=${req.ip} PATH=${req.path}`);
      res.status(429).json({ success: false, message });
    },
    skip: (req) => process.env.NODE_ENV === 'test',
  });

// ── Named limiters ───────────────────────────────────────
export const limiters = {
  // Auth: login, register — tightest
  auth: make({
    name: 'auth',
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many login attempts. Please wait 15 minutes before trying again.',
  }),

  // Strict: password reset, email verify (1 per hour)
  strict: make({
    name: 'strict',
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'Rate limit exceeded. Please try again in 1 hour.',
  }),

  // Payment: init, verify — strict
  payment: make({
    name: 'payment',
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many payment requests. Please wait 15 minutes.',
  }),

  // Mutations: create order, accept job
  mutation: make({
    name: 'mutation',
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: 'Too many requests. Please slow down.',
  }),

  // General: all read endpoints
  general: make({
    name: 'general',
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: 'Too many requests. Please try again shortly.',
  }),

  // Location updates (drivers push GPS frequently)
  location: make({
    name: 'location',
    windowMs: 60 * 1000,
    max: 60,  // 1 per second max
    message: 'Location update rate exceeded.',
  }),

  // OTP send/resend/forgot-password — very tight: 5 per 10 min per IP
  // Per-email cooldown (60s) is enforced separately inside the route handler
  otp: make({
    name: 'otp',
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: 'Too many OTP requests from this IP. Please wait 10 minutes before trying again.',
  }),

  // OTP verification — slightly looser to allow 5 attempts × 2 OTPs
  // Actual per-record attempt limit (5) is enforced inside the route handler
  otpVerify: make({
    name: 'otpVerify',
    windowMs: 10 * 60 * 1000,
    max: 15,
    message: 'Too many verification attempts. Please wait 10 minutes.',
  }),
};

export { checkBlocked, trackAbuse };
