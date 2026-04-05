import { Router } from 'express';
import { DriverProfile, Order, TrackingEvent, DriverEarning } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, validateAll, driverSchemas } from '../middleware/validate.js';

const router = Router();

// ── GET /api/drivers ─────────────────────────────────────
router.get('/', authenticate, authorize('admin'),
  validate(driverSchemas.listQuery, 'query'), async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const filter = status ? { status } : {};
    const total   = await DriverProfile.countDocuments(filter);
    const drivers = await DriverProfile.find(filter)
      .populate('userId', 'firstName lastName email phone createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ success: true, data: { drivers, pagination: { total, page, limit } } });
  } catch (e) { next(e); }
});

// ── GET /api/drivers/map ─────────────────────────────────
router.get('/map', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const drivers = await DriverProfile.find({
      status: { $in: ['available', 'busy'] }, currentLat: { $exists: true }
    }).populate('userId', 'firstName lastName').lean();

    const activeOrders = await Order.find({
      status: { $in: ['assigned', 'picked_up', 'in_transit', 'out_for_delivery'] }
    }).select('driverId waybillNumber status').lean();

    const orderMap = {};
    activeOrders.forEach(o => { orderMap[String(o.driverId)] = { orderId: o._id, waybillNumber: o.waybillNumber, orderStatus: o.status }; });

    const data = drivers.map(d => ({
      ...d,
      firstName: d.userId?.firstName, lastName: d.userId?.lastName,
      ...(orderMap[String(d._id)] || {}),
    }));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ── GET /api/drivers/jobs ────────────────────────────────
router.get('/jobs', authenticate, authorize('driver'), async (req, res, next) => {
  try {
    const jobs = await Order.find({
      status: 'booked', driverId: { $exists: false },
      $or: [{ paymentStatus: 'paid' }, { paymentMethod: { $in: ['cash', 'cod'] } }],
    }).sort({ createdAt: 1 }).limit(20).lean();
    res.json({ success: true, data: jobs });
  } catch (e) { next(e); }
});

// ── PUT /api/drivers/jobs/:orderId/accept ────────────────
router.put('/jobs/:orderId/accept', authenticate, authorize('driver'),
  validate(driverSchemas.orderIdParam, 'params'), async (req, res, next) => {
  try {
    const dp = await DriverProfile.findOne({ userId: req.user._id });
    if (!dp) return res.status(404).json({ success: false, message: 'Driver profile not found' });
    if (!dp.isVerified) return res.status(403).json({ success: false, message: 'Your account must be verified by admin before accepting jobs' });
    if (dp.status !== 'available') return res.status(400).json({ success: false, message: 'Set your status to Available before accepting a job' });

    const existing = await Order.findOne({ driverId: dp._id, status: { $nin: ['delivered', 'cancelled', 'returned'] } });
    if (existing) return res.status(400).json({ success: false, message: 'You already have an active delivery. Complete it before accepting a new job.' });

    const order = await Order.findOne({
      _id: req.params.orderId, status: 'booked', driverId: { $exists: false },
      $or: [{ paymentStatus: 'paid' }, { paymentMethod: { $in: ['cash', 'cod'] } }],
    });
    if (!order) return res.status(404).json({ success: false, message: 'Job is no longer available' });

    order.driverId   = dp._id;
    order.status     = 'assigned';
    order.assignedAt = new Date();
    order.statusHistory.push({ fromStatus: 'booked', toStatus: 'assigned', changedBy: req.user._id, note: 'Driver self-accepted job' });
    await order.save();
    await DriverProfile.findByIdAndUpdate(dp._id, { status: 'busy' });

    const io = req.app.get('io');
    io?.to('admin:room').emit('order:assigned', { orderId: order._id, driverId: dp._id, selfAccepted: true });
    io?.to(`order:${order._id}`).emit('order:assigned', { orderId: order._id, status: 'assigned' });

    res.json({ success: true, message: 'Job accepted! Head to Active Delivery to get started.', data: order });
  } catch (e) { next(e); }
});

// ── GET /api/drivers/active-order ───────────────────────
router.get('/active-order', authenticate, authorize('driver'), async (req, res, next) => {
  try {
    const dp = await DriverProfile.findOne({ userId: req.user._id });
    if (!dp) return res.status(404).json({ success: false, message: 'Driver profile not found' });
    const order = await Order.findOne({ driverId: dp._id, status: { $nin: ['delivered', 'cancelled', 'returned'] } })
      .populate('customerId', 'firstName lastName phone').lean();
    res.json({ success: true, data: order });
  } catch (e) { next(e); }
});

// ── GET /api/drivers/earnings ────────────────────────────
router.get('/earnings', authenticate, authorize('driver'), async (req, res, next) => {
  try {
    const dp = await DriverProfile.findOne({ userId: req.user._id });
    if (!dp) return res.status(404).json({ success: false, message: 'Driver profile not found' });

    const { page = 1, limit = 20 } = req.query;
    const pg = Math.max(1, Math.min(100, +page));
    const lm = Math.max(1, Math.min(50, +limit));

    const [records, summary] = await Promise.all([
      DriverEarning.find({ driverId: dp._id })
        .sort({ earnedAt: -1 }).skip((pg - 1) * lm).limit(lm).lean(),
      DriverEarning.aggregate([
        { $match: { driverId: dp._id } },
        { $group: { _id: null,
          totalEarnings:   { $sum: '$commission' },
          totalDeliveries: { $sum: 1 },
          thisMonth: { $sum: { $cond: [{ $gte: ['$earnedAt', new Date(new Date().getFullYear(), new Date().getMonth(), 1)] }, '$commission', 0] } },
          thisWeek:  { $sum: { $cond: [{ $gte: ['$earnedAt', new Date(Date.now() - 7 * 86400000)] }, '$commission', 0] } },
          avgPerDelivery: { $avg: '$commission' },
        }},
      ]),
    ]);
    res.json({ success: true, data: { records, summary: summary[0] || { totalEarnings:0, totalDeliveries:0, thisMonth:0, thisWeek:0, avgPerDelivery:0 } } });
  } catch (e) { next(e); }
});

// ── GET /api/drivers/:id ─────────────────────────────────
// Restricted to admin — customers and drivers have no business
// fetching arbitrary driver profiles (exposes plate, license, employeeId, phone).
router.get('/:id', authenticate, authorize('admin'), validate(driverSchemas.idParam, 'params'), async (req, res, next) => {
  try {
    const driver = await DriverProfile.findById(req.params.id)
      .populate('userId', 'firstName lastName email phone').lean();
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });
    res.json({ success: true, data: driver });
  } catch (e) { next(e); }
});

// ── PUT /api/drivers/status (driver updates own) ─────────
router.put('/status', authenticate, authorize('driver'),
  validate(driverSchemas.statusUpdate), async (req, res, next) => {
  try {
    const { status } = req.body;
    // Block going "available" while having an active order
    if (status === 'available') {
      const dp = await DriverProfile.findOne({ userId: req.user._id });
      const active = await Order.findOne({ driverId: dp?._id, status: { $nin: ['delivered','cancelled','returned'] } });
      if (active) return res.status(400).json({ success: false, message: 'Complete your current delivery before going available' });
    }
    await DriverProfile.findOneAndUpdate({ userId: req.user._id }, { status });
    res.json({ success: true, data: { status } });
  } catch (e) { next(e); }
});

// ── PUT /api/drivers/:id/status (admin updates) ──────────
router.put('/:id/status', authenticate, authorize('admin'),
  validateAll({ params: driverSchemas.idParam, body: driverSchemas.statusUpdate }),
  async (req, res, next) => {
  try {
    await DriverProfile.findByIdAndUpdate(req.params.id, { status: req.body.status });
    res.json({ success: true, data: { status: req.body.status } });
  } catch (e) { next(e); }
});

// ── PUT /api/drivers/:id/verify ──────────────────────────
router.put('/:id/verify', authenticate, authorize('admin'),
  validate(driverSchemas.idParam, 'params'), async (req, res, next) => {
  try {
    const verified = req.body.verified === true || req.body.verified === 'true';
    await DriverProfile.findByIdAndUpdate(req.params.id, { isVerified: verified });
    res.json({ success: true, message: verified ? 'Driver verified' : 'Verification removed' });
  } catch (e) { next(e); }
});

// ── POST /api/drivers/location ───────────────────────────
router.post('/location', authenticate, authorize('driver'),
  validate(driverSchemas.location), async (req, res, next) => {
  try {
    const { lat, lng, orderId } = req.body;
    const dp = await DriverProfile.findOneAndUpdate(
      { userId: req.user._id },
      { currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() }
    );
    if (orderId) {
      await TrackingEvent.create({ orderId, driverId: dp._id, lat, lng });
      const io = req.app.get('io');
      io?.to(`order:${orderId}`).emit('driver:locationUpdate', { lat, lng, orderId, driverId: dp._id, timestamp: new Date() });
      io?.to('admin:room').emit('driver:locationUpdate', { lat, lng, orderId, driverId: dp._id, userId: req.user._id, timestamp: new Date() });
    }
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
