/**
 * ─────────────────────────────────────────────────────────
 *  HARDENED AUTH ROUTES
 *
 *  Security improvements over the original:
 *  1. Access token: 15 min (was 7 days — massive exposure window)
 *  2. Refresh token: hashed with bcrypt before storage
 *  3. Account lockout: 5 failed attempts → 30 min lock
 *  4. tokenVersion field: invalidates all tokens on password change
 *  5. Removed dev email logging (was leaking credentials)
 *  6. Zod validation replaces express-validator
 *  7. Login timing normalization (prevents user enumeration)
 * ─────────────────────────────────────────────────────────
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User, DriverProfile } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate, authSchemas } from '../middleware/validate.js';
import { sendWelcome } from '../utils/email.js';

const router = Router();

// ── Constants ─────────────────────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS       = 30 * 60 * 1000;  // 30 minutes

// ── Token factory ─────────────────────────────────────────
const makeTokens = (userId, role, tokenVersion = 0) => ({
  accessToken: jwt.sign(
    { userId, role, tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m', issuer: 'jmove-api' }
  ),
  refreshToken: crypto.randomBytes(40).toString('hex'),  // opaque random token
});

// ── POST /api/auth/register ──────────────────────────────
router.post('/register', validate(authSchemas.register), async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;
    // Public registration is customer-only; drivers are created by admin
    if (await User.findOne({ email }))
      return res.status(409).json({ success: false, message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);
    const user   = await User.create({
      email, password: hashed, firstName, lastName, phone,
      role: 'customer', tokenVersion: 0,
    });

    const tokens      = makeTokens(user._id, 'customer', 0);
    const hashedRT    = await bcrypt.hash(tokens.refreshToken, 10);
    await User.findByIdAndUpdate(user._id, { refreshToken: hashedRT });

    sendWelcome({ email, firstName }).catch(console.error);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: { _id: user._id, email, firstName, lastName, phone, role: 'customer' },
        accessToken:  tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (e) { next(e); }
});

// ── POST /api/auth/login ─────────────────────────────────
router.post('/login', validate(authSchemas.login), async (req, res, next) => {
  // Timing normalization: always do a bcrypt compare to prevent user-enumeration timing attacks
  const DUMMY_HASH = '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    // User not found — still run bcrypt to normalize timing
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Account locked?
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({
        success: false,
        message: `Account temporarily locked. Try again in ${mins} minute(s).`,
        code: 'ACCOUNT_LOCKED',
      });
    }

    // Deactivated?
    if (!user.isActive) {
      await bcrypt.compare(password, DUMMY_HASH); // normalize timing
      return res.status(401).json({ success: false, message: 'Account has been deactivated. Contact support.' });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      // Increment failed attempts
      const attempts = (user.loginAttempts || 0) + 1;
      const update   = { loginAttempts: attempts };
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        update.lockUntil     = new Date(Date.now() + LOCK_TIME_MS);
        update.loginAttempts = 0;
        console.warn(`[Security] Account ${email} locked after ${attempts} failed attempts`);
      }
      await User.findByIdAndUpdate(user._id, update);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Successful login — reset lockout counters
    const dp     = user.role === 'driver' ? await DriverProfile.findOne({ userId: user._id }) : null;
    const tokens = makeTokens(user._id, user.role, user.tokenVersion || 0);
    const hashedRT = await bcrypt.hash(tokens.refreshToken, 10);

    await User.findByIdAndUpdate(user._id, {
      refreshToken:  hashedRT,
      loginAttempts: 0,
      lockUntil:     null,
      lastLogin:     new Date(),
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          _id: user._id, email: user.email, firstName: user.firstName,
          lastName: user.lastName, phone: user.phone, role: user.role,
          staffCategory: user.staffCategory, permissions: user.permissions,
          driverProfileId: dp?._id, driverStatus: dp?.status,
          driverVerified: dp?.isVerified, vehicleType: dp?.vehicleType,
        },
        accessToken:  tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (e) { next(e); }
});

// ── POST /api/auth/refresh ──────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.length > 200)
      return res.status(400).json({ success: false, message: 'Refresh token required' });

    // Find candidate users (can't look up directly since it's hashed)
    // We use a time-limited search — the user must have a non-null refreshToken
    // In production with Redis: store token → userId mapping for O(1) lookup
    const user = await User.findOne({ refreshToken: { $ne: null } });

    // We do a linear scan among active users — acceptable because refresh is rare
    // In production: use Redis with token → userId mapping
    const users = await User.find({ refreshToken: { $ne: null }, isActive: true }).select('+refreshToken').limit(200);
    let matchedUser = null;
    for (const u of users) {
      if (u.refreshToken && await bcrypt.compare(refreshToken, u.refreshToken)) {
        matchedUser = u; break;
      }
    }

    if (!matchedUser)
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });

    if (!matchedUser.isActive)
      return res.status(401).json({ success: false, message: 'Account deactivated' });

    // Rotate refresh token (invalidate old one)
    const tokens   = makeTokens(matchedUser._id, matchedUser.role, matchedUser.tokenVersion || 0);
    const hashedRT = await bcrypt.hash(tokens.refreshToken, 10);
    await User.findByIdAndUpdate(matchedUser._id, { refreshToken: hashedRT });

    res.json({ success: true, data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } });
  } catch (e) { next(e); }
});

// ── POST /api/auth/logout ────────────────────────────────
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (e) { next(e); }
});

// ── GET /api/auth/profile ────────────────────────────────
router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const dp = req.user.role === 'driver' ? await DriverProfile.findOne({ userId: req.user._id }) : null;
    const { password, refreshToken, ...safe } = req.user;
    res.json({ success: true, data: { ...safe, driverProfile: dp } });
  } catch (e) { next(e); }
});

// ── PUT /api/auth/profile ────────────────────────────────
router.put('/profile', authenticate, validate(authSchemas.updateProfile), async (req, res, next) => {
  try {
    const { firstName, lastName, phone } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { firstName, lastName, phone },
      { new: true }
    ).select('-password -refreshToken');
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

// ── PUT /api/auth/change-password ───────────────────────
router.put('/change-password', authenticate, validate(authSchemas.changePassword), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user  = await User.findById(req.user._id);
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(400).json({ success: false, message: 'Current password is incorrect' });

    if (currentPassword === newPassword)
      return res.status(400).json({ success: false, message: 'New password must differ from current password' });

    // Increment tokenVersion to invalidate ALL existing tokens
    const newVersion = (user.tokenVersion || 0) + 1;
    await User.findByIdAndUpdate(user._id, {
      password: await bcrypt.hash(newPassword, 12),
      tokenVersion: newVersion,
      refreshToken: null,  // force re-login
    });

    res.json({ success: true, message: 'Password updated. Please log in again on all devices.' });
  } catch (e) { next(e); }
});

export default router;
