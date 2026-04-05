/**
 * ─────────────────────────────────────────────────────────
 *  HARDENED AUTH ROUTES — with full OTP system
 *
 *  Registration flow:
 *    POST /register    → create account (unverified) + send OTP
 *    POST /verify-otp  → verify OTP → mark verified → issue tokens
 *    POST /resend-otp  → resend verification OTP (60s cooldown)
 *
 *  Password reset flow:
 *    POST /forgot-password   → send reset OTP (anti-enum: always 200)
 *    POST /verify-reset-otp  → verify OTP → return short-lived resetToken JWT
 *    POST /reset-password    → use resetToken + new password
 *
 *  Session management:
 *    POST /login           → login (requires emailVerified)
 *    POST /refresh         → rotate refresh token
 *    POST /logout          → invalidate refresh token
 *    GET  /profile         → get current user
 *    PUT  /profile         → update profile
 *    PUT  /change-password → change password + invalidate all tokens
 *
 *  Security:
 *    - OTPs: bcrypt-hashed, expire in 10 min, max 5 attempts, single-use
 *    - Lockout: 5 failed login attempts → 30 min lock
 *    - tokenVersion: increment on password change → invalidates all JWTs
 *    - Timing normalization on login → prevents user enumeration
 *    - Anti-enumeration on forgot-password → always 200
 *    - Per-email 60s cooldown between OTP sends
 * ─────────────────────────────────────────────────────────
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User, DriverProfile, OtpToken } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate, authSchemas, otpSchemas } from '../middleware/validate.js';
import {
  sendWelcome,
  sendOtpVerification,
  sendPasswordResetOtp,
} from '../utils/email.js';

const router = Router();

// ── Constants ──────────────────────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS       = 30 * 60 * 1000;  // 30 min login lockout
const OTP_TTL_MS         = 10 * 60 * 1000;  // 10 min OTP expiry
const MAX_OTP_ATTEMPTS   = 5;               // wrong guesses before OTP is locked
const OTP_COOLDOWN_MS    = 60 * 1000;       // 60s between OTP sends for same email

// ── Token factory ──────────────────────────────────────────
const makeTokens = (userId, role, tokenVersion = 0) => ({
  accessToken: jwt.sign(
    { userId, role, tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m', issuer: 'jmove-api' }
  ),
  refreshToken: crypto.randomBytes(40).toString('hex'),
});

// ═══════════════════════════════════════════════════════════
//  OTP HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Generate a cryptographically random 6-digit OTP, bcrypt-hash it,
 * store in DB (replacing any previous OTP for same email+purpose),
 * and return the plain OTP for delivery.
 *
 * Rotation: deleteMany first → only one active OTP per email+purpose at all times.
 */
const createOtp = async (email, purpose) => {
  // Invalidate any previous OTP for this email+purpose (rotation)
  await OtpToken.deleteMany({ email, purpose });

  // crypto.randomInt(min, max) is cryptographically secure; range gives exactly 6 digits
  const otp       = crypto.randomInt(100000, 1000000).toString();
  const hashedOtp = await bcrypt.hash(otp, 10);

  await OtpToken.create({
    email,
    hashedOtp,
    purpose,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  return otp; // plain OTP — only used to email/log; never stored or re-exposed
};

/**
 * Verify a submitted OTP against the stored record.
 * Increments attempt counter on failure; marks usedAt on success.
 *
 * Returns { ok: true } on success, or
 *         { ok: false, code, message } on failure.
 */
const verifyOtpRecord = async (email, otp, purpose) => {
  const record = await OtpToken.findOne({ email, purpose, usedAt: null });

  if (!record) {
    return {
      ok: false,
      code: 'OTP_NOT_FOUND',
      message: 'No active verification code found. Please request a new one.',
    };
  }

  if (record.expiresAt < new Date()) {
    await OtpToken.deleteOne({ _id: record._id }); // eager cleanup
    return {
      ok: false,
      code: 'OTP_EXPIRED',
      message: 'Verification code has expired. Please request a new one.',
    };
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    return {
      ok: false,
      code: 'OTP_MAX_ATTEMPTS',
      message: 'Too many incorrect attempts. Please request a new code.',
    };
  }

  const isValid = await bcrypt.compare(otp, record.hashedOtp);

  if (!isValid) {
    record.attempts += 1;
    await record.save();
    const remaining = MAX_OTP_ATTEMPTS - record.attempts;
    if (remaining <= 0) {
      return {
        ok: false,
        code: 'OTP_MAX_ATTEMPTS',
        message: 'Too many incorrect attempts. Please request a new code.',
      };
    }
    return {
      ok: false,
      code: 'OTP_WRONG',
      message: `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
    };
  }

  // ✅ Valid — mark as used (single-use enforcement)
  record.usedAt = new Date();
  await record.save();

  return { ok: true };
};

// ═══════════════════════════════════════════════════════════
//  REGISTRATION
// ═══════════════════════════════════════════════════════════

// ── POST /api/auth/register ──────────────────────────────
// Creates account in unverified state, sends OTP.
// Tokens are NOT issued here — only after /verify-otp succeeds.
router.post('/register', validate(authSchemas.register), async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    if (await User.findOne({ email }))
      return res.status(409).json({ success: false, message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);
    await User.create({
      email, password: hashed, firstName, lastName, phone,
      role: 'customer', emailVerified: false, tokenVersion: 0,
    });

    // Generate and send verification OTP
    const otp = await createOtp(email, 'email_verification');
    sendOtpVerification({ email, firstName, otp }).catch(console.error);

    res.status(201).json({
      success: true,
      message: `Account created! A 6-digit verification code has been sent to ${email}.`,
      data: { email },
    });
  } catch (e) { next(e); }
});

// ── POST /api/auth/verify-otp ────────────────────────────
// Verify email OTP → mark account verified → issue session tokens.
router.post('/verify-otp', validate(otpSchemas.verifyOtp), async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const result = await verifyOtpRecord(email, otp, 'email_verification');
    if (!result.ok) {
      const status = result.code === 'OTP_MAX_ATTEMPTS' ? 429 : 400;
      return res.status(status).json({ success: false, message: result.message, code: result.code });
    }

    const user = await User.findOneAndUpdate(
      { email },
      { emailVerified: true },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });

    // Issue session tokens (same as login)
    const dp      = user.role === 'driver' ? await DriverProfile.findOne({ userId: user._id }) : null;
    const tokens  = makeTokens(user._id, user.role, user.tokenVersion || 0);
    const hashedRT = await bcrypt.hash(tokens.refreshToken, 10);

    await User.findByIdAndUpdate(user._id, {
      refreshToken: hashedRT, loginAttempts: 0, lockUntil: null, lastLogin: new Date(),
    });

    // Welcome email now that account is fully active
    sendWelcome({ email: user.email, firstName: user.firstName }).catch(console.error);

    res.json({
      success: true,
      message: 'Email verified! Welcome to JMove Logistics.',
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

// ── POST /api/auth/resend-otp ────────────────────────────
// Resend verification OTP for registered but unverified accounts.
// Anti-enum: always returns the same generic message.
router.post('/resend-otp', validate(otpSchemas.resendOtp), async (req, res, next) => {
  try {
    const { email } = req.body;

    const SAFE_MSG = 'If this email is registered and awaiting verification, a new code has been sent.';

    const user = await User.findOne({ email });
    if (!user || user.emailVerified) {
      // Don't reveal whether the account exists or is already verified
      return res.json({ success: true, message: SAFE_MSG });
    }

    // Per-email cooldown: reject if an OTP was created in the last 60 seconds
    const recent = await OtpToken.findOne({
      email,
      purpose: 'email_verification',
      usedAt: null,
      createdAt: { $gte: new Date(Date.now() - OTP_COOLDOWN_MS) },
    });
    if (recent) {
      const waitSec = Math.ceil(
        (recent.createdAt.getTime() + OTP_COOLDOWN_MS - Date.now()) / 1000
      );
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSec} second${waitSec !== 1 ? 's' : ''} before requesting a new code.`,
        code: 'OTP_COOLDOWN',
        data: { waitSeconds: waitSec },
      });
    }

    const otp = await createOtp(email, 'email_verification');
    sendOtpVerification({ email, firstName: user.firstName, otp }).catch(console.error);

    res.json({ success: true, message: SAFE_MSG });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════
//  PASSWORD RESET
// ═══════════════════════════════════════════════════════════

// ── POST /api/auth/forgot-password ──────────────────────
// Sends a reset OTP. ALWAYS returns 200 regardless of whether the email
// exists — prevents user enumeration attacks.
router.post('/forgot-password', validate(otpSchemas.forgotPassword), async (req, res, next) => {
  try {
    const { email } = req.body;

    // Anti-enumeration: this message is sent whether email exists or not
    const SAFE_MSG = 'If an account with this email exists, a password reset code has been sent.';

    const user = await User.findOne({ email, isActive: true });
    if (!user) return res.json({ success: true, message: SAFE_MSG });

    // Per-email cooldown: prevent hammering a specific inbox
    const recent = await OtpToken.findOne({
      email,
      purpose: 'password_reset',
      createdAt: { $gte: new Date(Date.now() - OTP_COOLDOWN_MS) },
    });
    if (recent) {
      // Still 200 for anti-enumeration — but hinting to check inbox
      return res.json({
        success: true,
        message: 'A code was recently sent. Please check your inbox, or wait a moment before requesting another.',
      });
    }

    const otp = await createOtp(email, 'password_reset');
    sendPasswordResetOtp({ email, firstName: user.firstName, otp }).catch(console.error);

    res.json({ success: true, message: SAFE_MSG });
  } catch (e) { next(e); }
});

// ── POST /api/auth/verify-reset-otp ─────────────────────
// Verifies the password-reset OTP.
// On success: returns a short-lived resetToken JWT (15 min).
// The frontend must present this token to /reset-password.
router.post('/verify-reset-otp', validate(otpSchemas.verifyResetOtp), async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const result = await verifyOtpRecord(email, otp, 'password_reset');
    if (!result.ok) {
      const status = result.code === 'OTP_MAX_ATTEMPTS' ? 429 : 400;
      return res.status(status).json({ success: false, message: result.message, code: result.code });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });

    // Sign a short-lived reset token embedding tokenVersion.
    // If the password is changed by any other means before this token is used,
    // tokenVersion increments and this token is silently invalidated.
    const resetToken = jwt.sign(
      { email, purpose: 'password_reset', tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '15m', issuer: 'jmove-api' }
    );

    res.json({
      success: true,
      message: 'Code verified. You may now set a new password.',
      data: { resetToken },
    });
  } catch (e) { next(e); }
});

// ── POST /api/auth/reset-password ───────────────────────
// Completes password reset using the resetToken JWT issued by /verify-reset-otp.
// Verifies: JWT signature, purpose, tokenVersion (prevents reuse).
// On success: updates password, increments tokenVersion (invalidates ALL sessions).
router.post('/reset-password', validate(otpSchemas.resetPassword), async (req, res, next) => {
  try {
    const { resetToken, newPassword } = req.body;

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Reset link has expired. Please request a new password reset.',
          code: 'RESET_TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({ success: false, message: 'Invalid reset token.' });
    }

    // Confirm token was issued for password reset
    if (decoded.purpose !== 'password_reset' || !decoded.email) {
      return res.status(401).json({ success: false, message: 'Invalid reset token.' });
    }

    const user = await User.findOne({ email: decoded.email });
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });

    // Verify tokenVersion matches — prevents reuse after any password change
    if ((user.tokenVersion || 0) !== decoded.tokenVersion) {
      return res.status(401).json({
        success: false,
        message: 'This reset link has already been used. Please request a new one.',
        code: 'RESET_TOKEN_USED',
      });
    }

    // Prevent reusing the current password
    const same = await bcrypt.compare(newPassword, user.password);
    if (same) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from your current password.',
      });
    }

    // Update password + rotate tokenVersion (invalidates this resetToken and ALL active JWTs)
    await User.findByIdAndUpdate(user._id, {
      password:      await bcrypt.hash(newPassword, 12),
      tokenVersion:  (user.tokenVersion || 0) + 1,
      refreshToken:  null,  // force re-login on all devices
      loginAttempts: 0,
      lockUntil:     null,
    });

    res.json({
      success: true,
      message: 'Password updated successfully. Please log in with your new password.',
    });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════
//  SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════

// ── POST /api/auth/login ─────────────────────────────────
router.post('/login', validate(authSchemas.login), async (req, res, next) => {
  // Timing normalization: always run a bcrypt compare to prevent user-enumeration
  const DUMMY_HASH = '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH); // normalize timing
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

    // Email not yet verified (check AFTER password to prevent enumeration of unverified accounts)
    if (!user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address before logging in. Check your inbox for a verification code.',
        code: 'EMAIL_NOT_VERIFIED',
        data: { email: user.email },
      });
    }

    // Successful login — reset lockout counters
    const dp      = user.role === 'driver' ? await DriverProfile.findOne({ userId: user._id }) : null;
    const tokens  = makeTokens(user._id, user.role, user.tokenVersion || 0);
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

    // Linear scan — bcrypt-hashed tokens can't be looked up directly.
    // Production upgrade: Redis with token → userId mapping for O(1) lookup.
    const users = await User.find({ refreshToken: { $ne: null }, isActive: true })
      .select('+refreshToken').limit(200);

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

    const newVersion = (user.tokenVersion || 0) + 1;
    await User.findByIdAndUpdate(user._id, {
      password:     await bcrypt.hash(newPassword, 12),
      tokenVersion: newVersion,
      refreshToken: null,
    });

    res.json({ success: true, message: 'Password updated. Please log in again on all devices.' });
  } catch (e) { next(e); }
});

export default router;
