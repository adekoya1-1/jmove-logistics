import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { User, DriverProfile } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { sendWelcome } from '../utils/email.js';

const router = Router();

const makeTokens = (userId, role) => ({
  accessToken:  jwt.sign({ userId, role }, process.env.JWT_SECRET,         { expiresIn: process.env.JWT_EXPIRES_IN  || '7d' }),
  refreshToken: jwt.sign({ userId, role }, process.env.JWT_REFRESH_SECRET  || process.env.JWT_SECRET + '_r', { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }),
});

// POST /api/auth/register
router.post('/register', [
  body('email').isEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[A-Z])(?=.*[0-9])/),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { password, firstName, lastName, phone, role, vehicleType, vehiclePlate, vehicleModel, licenseNumber } = req.body;
    const email = req.body.email.toLowerCase().trim();
    // Drivers can only be created by admin — public registration is customer-only
    const userRole = role === 'customer' ? 'customer' : 'customer';

    if (await User.findOne({ email }))
      return res.status(409).json({ success: false, message: 'Email already registered' });

    const user = await User.create({ email, password: await bcrypt.hash(password, 12), firstName, lastName, phone, role: userRole });

    if (userRole === 'driver' && vehicleType && vehiclePlate)
      await DriverProfile.create({ userId: user._id, vehicleType, vehiclePlate, vehicleModel, licenseNumber });

    const tokens = makeTokens(user._id, userRole);
    await User.findByIdAndUpdate(user._id, { refreshToken: tokens.refreshToken });
    sendWelcome({ email, firstName }).catch(console.error);

    const safe = { _id: user._id, email, firstName, lastName, phone, role: userRole };
    res.status(201).json({ success: true, message: 'Registration successful', data: { user: safe, ...tokens } });
  } catch (e) { next(e); }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { password } = req.body;
    const email = req.body.email.toLowerCase().trim();
    const user = await User.findOne({ email });

    // User not found
    if (!user) {
      if (process.env.NODE_ENV !== 'production')
        console.log(`[Login] No user found for email: ${email} — run: npm run seed`);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // User deactivated
    if (!user.isActive)
      return res.status(401).json({ success: false, message: 'Account has been deactivated. Contact admin.' });

    // Wrong password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      if (process.env.NODE_ENV !== 'production')
        console.log(`[Login] Wrong password for: ${email}`);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const dp = user.role === 'driver' ? await DriverProfile.findOne({ userId: user._id }) : null;
    const tokens = makeTokens(user._id, user.role);
    await User.findByIdAndUpdate(user._id, { refreshToken: tokens.refreshToken, lastLogin: new Date() });

    res.json({ success: true, message: 'Login successful', data: {
      user: { _id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone, role: user.role,
        driverProfileId: dp?._id, driverStatus: dp?.status, driverVerified: dp?.isVerified, vehicleType: dp?.vehicleType },
      ...tokens,
    }});
  } catch (e) { next(e); }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token required' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_r');
    const user    = await User.findById(decoded.userId);
    if (!user || user.refreshToken !== refreshToken || !user.isActive)
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });

    const tokens = makeTokens(user._id, user.role);
    await User.findByIdAndUpdate(user._id, { refreshToken: tokens.refreshToken });
    res.json({ success: true, data: tokens });
  } catch (e) { next(e); }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
    res.json({ success: true, message: 'Logged out' });
  } catch (e) { next(e); }
});

// GET /api/auth/profile
router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const dp = req.user.role === 'driver' ? await DriverProfile.findOne({ userId: req.user._id }) : null;
    res.json({ success: true, data: { ...req.user.toObject(), driverProfile: dp } });
  } catch (e) { next(e); }
});

// PUT /api/auth/profile
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { firstName, lastName, phone } = req.body;
    const user = await User.findByIdAndUpdate(req.user._id, { firstName, lastName, phone }, { new: true }).select('-password -refreshToken');
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user  = await User.findById(req.user._id);
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    await User.findByIdAndUpdate(req.user._id, { password: await bcrypt.hash(newPassword, 12) });
    res.json({ success: true, message: 'Password updated' });
  } catch (e) { next(e); }
});

export default router;
