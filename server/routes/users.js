import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, Order, DriverProfile, Payment, Notification } from '../db.js';
import { authenticate, authorize, requirePermission } from '../middleware/auth.js';
import { validate, staffSchemas } from '../middleware/validate.js';

const router = Router();

// ── GET /api/users/staff ─────────────────────────────────
router.get('/staff', authenticate, authorize('admin'), requirePermission('staff'),
  validate(staffSchemas.staffQuery, 'query'), async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    const filter = { role: 'admin' };
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { firstName: new RegExp(safe, 'i') },
        { lastName:  new RegExp(safe, 'i') },
        { email:     new RegExp(safe, 'i') },
      ];
    }
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-password -refreshToken -loginAttempts -lockUntil -tokenVersion')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ success: true, data: { users, pagination: { total, page, limit, pages: Math.ceil(total / limit) } } });
  } catch (e) { next(e); }
});

// ── POST /api/users/admin/staff ──────────────────────────
router.post('/admin/staff', authenticate, authorize('admin'), requirePermission('staff'),
  validate(staffSchemas.create), async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, password, staffCategory, permissions } = req.body;

    if (await User.findOne({ email }))
      return res.status(409).json({ success: false, message: 'Email already registered' });

    const validPerms = ['orders','drivers','payments','analytics','map','staff'];
    const finalPerms = staffCategory === 'super_admin' ? validPerms : (permissions || []).filter(p => validPerms.includes(p));

    const user = await User.create({
      email, password: await bcrypt.hash(password, 12),
      firstName, lastName, phone,
      role: 'admin', staffCategory,
      permissions: finalPerms,
      emailVerified: true, isActive: true, tokenVersion: 0,
    });

    res.status(201).json({
      success: true,
      message: `Staff account created for ${firstName} ${lastName}`,
      data: { _id: user._id, email, firstName, lastName, phone, staffCategory, permissions: finalPerms },
    });
  } catch (e) { next(e); }
});

// ── PUT /api/users/staff/:id/permissions ─────────────────
router.put('/staff/:id/permissions', authenticate, authorize('admin'), requirePermission('staff'),
  validate(staffSchemas.idParam, 'params'),
  validate(staffSchemas.updatePermissions), async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target || target.role !== 'admin')
      return res.status(404).json({ success: false, message: 'Staff member not found' });

    // Prevent modifying own permissions (super_admin protection)
    if (String(target._id) === String(req.user._id) && req.user.staffCategory !== 'super_admin')
      return res.status(403).json({ success: false, message: 'Cannot modify your own permissions' });

    const { permissions, staffCategory } = req.body;
    const validPerms = ['orders','drivers','payments','analytics','map','staff'];
    const cleanPerms = staffCategory === 'super_admin' ? validPerms : (permissions || []).filter(p => validPerms.includes(p));

    await User.findByIdAndUpdate(req.params.id, {
      permissions: cleanPerms,
      ...(staffCategory && { staffCategory }),
    });
    res.json({ success: true, message: 'Permissions updated' });
  } catch (e) { next(e); }
});

// ── GET /api/users/notifications ────────────────────────
router.get('/notifications', authenticate, async (req, res, next) => {
  try {
    const notes = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    res.json({ success: true, data: notes });
  } catch (e) { next(e); }
});

// ── PUT /api/users/notifications/:id/read ───────────────
router.put('/notifications/:id/read', authenticate, async (req, res, next) => {
  try {
    // Scoped to req.user._id — prevents marking other users' notifications
    await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { isRead: true });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── GET /api/users/admin/dashboard ──────────────────────
router.get('/admin/dashboard', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [orderSummary, userSummary, revenueSummary, recentOrders, availableDrivers] = await Promise.all([
      Order.aggregate([{ $group: { _id: null,
        total:     { $sum: 1 },
        pending:   { $sum: { $cond: [{ $eq: ['$status', 'booked']     }, 1, 0] } },
        inTransit: { $sum: { $cond: [{ $eq: ['$status', 'in_transit'] }, 1, 0] } },
        delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered']  }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled']  }, 1, 0] } },
      }}]),
      User.aggregate([{ $match: { role: { $ne: 'admin' } } }, { $group: { _id: null,
        total:       { $sum: 1 },
        customers:   { $sum: { $cond: [{ $eq: ['$role', 'customer'] }, 1, 0] } },
        drivers:     { $sum: { $cond: [{ $eq: ['$role', 'driver']   }, 1, 0] } },
        newThisWeek: { $sum: { $cond: [{ $gte: ['$createdAt', new Date(Date.now() - 7 * 86400000)] }, 1, 0] } },
      }}]),
      Payment.aggregate([{ $group: { _id: null,
        totalRevenue:   { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
        monthlyRevenue: { $sum: { $cond: [{ $and: [{ $eq: ['$status','paid'] }, { $gte: ['$paidAt', new Date(Date.now() - 30*86400000)] }] }, '$amount', 0] } },
        weeklyRevenue:  { $sum: { $cond: [{ $and: [{ $eq: ['$status','paid'] }, { $gte: ['$paidAt', new Date(Date.now() -  7*86400000)] }] }, '$amount', 0] } },
      }}]),
      Order.find().sort({ createdAt: -1 }).limit(5).populate('customerId', 'firstName lastName').lean(),
      DriverProfile.countDocuments({ status: 'available' }),
    ]);

    res.json({ success: true, data: {
      orders:           orderSummary[0]  || {},
      users:            userSummary[0]   || {},
      revenue:          revenueSummary[0]|| {},
      recentOrders,
      availableDrivers,
    }});
  } catch (e) { next(e); }
});

// ── POST /api/users/admin/drivers ────────────────────────
router.post('/admin/drivers', authenticate, authorize('admin'), requirePermission('drivers'),
  async (req, res, next) => {
  try {
    // Use staffSchemas.create for driver creation (same structure)
    const {
      firstName, lastName, email, phone, password,
      vehicleType, vehiclePlate, vehicleModel, licenseNumber, employeeId,
    } = req.body;

    if (!firstName || !lastName || !email || !password || !vehicleType || !vehiclePlate)
      return res.status(400).json({ success: false, message: 'Required fields: firstName, lastName, email, password, vehicleType, vehiclePlate' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    const normalizedEmail = (email || '').toLowerCase().trim();
    if (await User.findOne({ email: normalizedEmail }))
      return res.status(409).json({ success: false, message: 'Email already registered' });

    const user = await User.create({
      email: normalizedEmail,
      password: await bcrypt.hash(password, 12),
      firstName, lastName, phone, role: 'driver',
      emailVerified: true, tokenVersion: 0,
    });

    await DriverProfile.create({
      userId: user._id, vehicleType,
      vehiclePlate: vehiclePlate.toUpperCase().trim(),
      vehicleModel, licenseNumber, employeeId,
      isVerified: true, status: 'offline',
    });

    res.status(201).json({ success: true, message: `Driver account created for ${firstName} ${lastName}`, data: { userId: user._id, email: normalizedEmail, firstName, lastName } });
  } catch (e) { next(e); }
});

// ── GET /api/users ───────────────────────────────────────
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const pg = Math.max(1, +page), lm = Math.min(50, Math.max(1, +limit));
    const filter = {};
    if (role)   filter.role = role;
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ firstName: new RegExp(safe, 'i') }, { lastName: new RegExp(safe, 'i') }, { email: new RegExp(safe, 'i') }];
    }
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-password -refreshToken -loginAttempts -lockUntil -tokenVersion')
      .sort({ createdAt: -1 }).skip((pg - 1) * lm).limit(lm).lean();
    res.json({ success: true, data: { users, pagination: { total, page: pg, limit: lm, pages: Math.ceil(total / lm) } } });
  } catch (e) { next(e); }
});

// ── GET /api/users/:id ───────────────────────────────────
router.get('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -refreshToken -loginAttempts -lockUntil -tokenVersion')
      .lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const dp     = user.role === 'driver' ? await DriverProfile.findOne({ userId: user._id }).lean() : null;
    const orders = await Order.find({ customerId: user._id }).select('waybillNumber status totalAmount originCity destinationCity createdAt').sort({ createdAt: -1 }).limit(5).lean();
    res.json({ success: true, data: { user, driverProfile: dp, recentOrders: orders } });
  } catch (e) { next(e); }
});

// ── PUT /api/users/:id/toggle-status ─────────────────────
router.put('/:id/toggle-status', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    // Prevent self-deactivation
    if (String(user._id) === String(req.user._id))
      return res.status(400).json({ success: false, message: 'Cannot deactivate your own account' });
    user.isActive = !user.isActive;
    // Invalidate all tokens when deactivating
    if (!user.isActive) { user.refreshToken = null; user.tokenVersion = (user.tokenVersion || 0) + 1; }
    await user.save();
    res.json({ success: true, message: `User ${user.isActive ? 'activated' : 'deactivated'}`, data: { isActive: user.isActive } });
  } catch (e) { next(e); }
});

export default router;
