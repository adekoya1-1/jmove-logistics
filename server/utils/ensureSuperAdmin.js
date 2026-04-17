/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ensureSuperAdmin — Idempotent startup seeder
 *
 *  Called once on every server boot (after connectDB resolves).
 *  If a super admin account does not yet exist in the database, it creates one
 *  using the credentials stored in environment variables.
 *
 *  Behaviour summary:
 *    ✔  Reads SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD from process.env
 *    ✔  Checks whether any admin with staffCategory = 'super_admin' exists
 *    ✔  Creates the account only when none is found (fully idempotent)
 *    ✔  Hashes the password with bcrypt (12 rounds) — never stores plain text
 *    ✔  Never logs the password at any log level
 *    ✔  Emits a clear console warning when env vars are missing (non-fatal)
 *    ✔  Catches all errors — a seeding failure never crashes the server
 *
 *  Security notes:
 *    • emailVerified is set to true so the account can log in immediately
 *      (no OTP flow for system-seeded accounts)
 *    • staffCategory = 'super_admin' bypasses all requirePermission checks
 *      (see server/middleware/auth.js → requirePermission)
 *    • Change the password immediately after first production deployment
 * ─────────────────────────────────────────────────────────────────────────────
 */

import bcrypt from 'bcryptjs';
import { User } from '../db.js';

export const ensureSuperAdmin = async () => {
  const email    = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;

  // ── Failsafe: skip gracefully if either env var is absent ────────────────
  if (!email || !password) {
    console.warn(
      '\n  [SuperAdmin] ⚠️  Super Admin credentials not set in environment variables.\n' +
      '               Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD to enable auto-setup.\n'
    );
    return;
  }

  // ── Basic sanity checks (do not reveal values in logs) ───────────────────
  if (password.length < 8) {
    console.warn(
      '[SuperAdmin] ⚠️  SUPER_ADMIN_PASSWORD is too short (minimum 8 characters). ' +
      'Skipping super admin creation.'
    );
    return;
  }

  try {
    // ── Check by role + staffCategory (independent of email) ─────────────
    // This prevents duplicate accounts if the email env var is later changed.
    const existingByRole = await User.findOne({
      role:          'admin',
      staffCategory: 'super_admin',
    }).select('_id email').lean();

    if (existingByRole) {
      console.log(
        `[SuperAdmin] ✅ Super admin account already exists (${existingByRole.email}) — skipping.`
      );
      return;
    }

    // ── Also check if the target email already exists under a different role ─
    const existingByEmail = await User.findOne({ email }).select('_id role').lean();
    if (existingByEmail) {
      console.warn(
        `[SuperAdmin] ⚠️  Email ${email} is already registered as role="${existingByEmail.role}". ` +
        'Cannot create super admin with this email. Update SUPER_ADMIN_EMAIL or remove the conflict.'
      );
      return;
    }

    // ── Hash password — bcrypt 12 rounds ─────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 12);

    // ── Create the account ────────────────────────────────────────────────
    await User.create({
      email,
      password:      hashedPassword,
      firstName:     'Super',
      lastName:      'Admin',
      role:          'admin',
      staffCategory: 'super_admin',
      permissions:   ['orders', 'drivers', 'payments', 'analytics', 'map', 'staff'],
      isActive:      true,
      emailVerified: true,   // No OTP required for system-seeded accounts
      tokenVersion:  0,
      loginAttempts: 0,
      lockUntil:     null,
    });

    console.log(`[SuperAdmin] ✅ Super admin account created (${email})`);
    console.log('             ⚠️  Change this password after your first login.');

  } catch (err) {
    // Non-fatal — a seeding failure never prevents the server from starting.
    // Admin can be manually created via server/utils/seed.js if needed.
    console.error('[SuperAdmin] ❌ Failed to create super admin account:', err.message);
  }
};
