import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, Order, DriverProfile, Payment, Notification } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// GET /api/users  (admin)
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (role)   filter.role = role;
    if (search) filter.$or = [{ firstName: new RegExp(search, 'i') }, { lastName: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];

    const total = await User.countDocuments(filter);
    const users = await User.find(filter).select('-password -refreshToken').sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit);
    res.json({ success: true, data: { users, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } } });
  } catch (e) { next(e); }
});

// GET /api/users/notifications
router.get('/notifications', authenticate, async (req, res, next) => {
  try {
    const notes = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, data: notes });
  } catch (e) { next(e); }
});

// PUT /api/users/notifications/:id/read
router.put('/notifications/:id/read', authenticate, async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { isRead: true });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// GET /api/users/:id  (admin)
router.get('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password -refreshToken');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const dp     = user.role === 'driver' ? await DriverProfile.findOne({ userId: user._id }) : null;
    const orders = await Order.find({ customerId: user._id }).select('waybillNumber status totalAmount originCity destinationCity createdAt').sort({ createdAt: -1 }).limit(5);
    res.json({ success: true, data: { user, driverProfile: dp, recentOrders: orders } });
  } catch (e) { next(e); }
});

// PUT /api/users/:id/toggle-status  (admin)
router.put('/:id/toggle-status', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ success: true, message: `User ${user.isActive ? 'activated' : 'deactivated'}`, data: { isActive: user.isActive } });
  } catch (e) { next(e); }
});

// GET /api/users/admin/dashboard
router.get('/admin/dashboard', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [orderSummary, userSummary, revenueSummary, recentOrders, availableDrivers] = await Promise.all([
      Order.aggregate([{ $group: { _id: null,
        total:     { $sum: 1 },
        pending:   { $sum: { $cond: [{ $eq: ['$status', 'booked']    }, 1, 0] } },
        inTransit: { $sum: { $cond: [{ $eq: ['$status', 'in_transit'] }, 1, 0] } },
        delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered']  }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled']  }, 1, 0] } },
      }}]),
      User.aggregate([{ $match: { role: { $ne: 'admin' } } }, { $group: { _id: null,
        total:     { $sum: 1 },
        customers: { $sum: { $cond: [{ $eq: ['$role', 'customer'] }, 1, 0] } },
        drivers:   { $sum: { $cond: [{ $eq: ['$role', 'driver']   }, 1, 0] } },
        newThisWeek: { $sum: { $cond: [{ $gte: ['$createdAt', new Date(Date.now() - 7 * 86400000)] }, 1, 0] } },
      }}]),
      Payment.aggregate([{ $group: { _id: null,
        totalRevenue:   { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
        monthlyRevenue: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'paid'] }, { $gte: ['$paidAt', new Date(Date.now() - 30 * 86400000)] }] }, '$amount', 0] } },
        weeklyRevenue:  { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'paid'] }, { $gte: ['$paidAt', new Date(Date.now() -  7 * 86400000)] }] }, '$amount', 0] } },
      }}]),
      Order.find().sort({ createdAt: -1 }).limit(5).populate('customerId', 'firstName lastName'),
      DriverProfile.countDocuments({ status: 'available' }),
    ]);

    res.json({ success: true, data: {
      orders: orderSummary[0] || {},
      users:  userSummary[0]  || {},
      revenue: revenueSummary[0] || {},
      recentOrders,
      availableDrivers,
    }});
  } catch (e) { next(e); }
});

export default router;

// ── Admin: create a driver account ────────────────────────────────────────

router.post('/admin/drivers', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const {
      firstName, lastName, email, phone, password,
      vehicleType, vehiclePlate, vehicleModel, licenseNumber, employeeId,
    } = req.body;

    if (!firstName || !lastName || !email || !password || !vehicleType || !vehiclePlate)
      return res.status(400).json({ success: false, message: 'First name, last name, email, password, vehicle type and plate are required' });

    const normalizedEmail = email.toLowerCase().trim();
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) return res.status(409).json({ success: false, message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: normalizedEmail, password: hashed,
      firstName, lastName, phone, role: 'driver', emailVerified: true,
    });

    await DriverProfile.create({
      userId: user._id, vehicleType, vehiclePlate, vehicleModel,
      licenseNumber, employeeId, isVerified: true, status: 'offline',
    });

    res.status(201).json({
      success: true,
      message: `Driver account created for ${firstName} ${lastName}`,
      data: { userId: user._id, email, firstName, lastName },
    });
  } catch (e) { next(e); }
});
