import { Router } from 'express';
import { DriverProfile, Order, TrackingEvent } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// GET /api/drivers
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const total   = await DriverProfile.countDocuments(filter);
    const drivers = await DriverProfile.find(filter)
      .populate('userId', 'firstName lastName email phone createdAt')
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit);
    res.json({ success: true, data: { drivers, pagination: { total, page: +page, limit: +limit } } });
  } catch (e) { next(e); }
});

// GET /api/drivers/map
router.get('/map', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const drivers = await DriverProfile.find({ status: { $in: ['available', 'busy'] }, currentLat: { $exists: true } })
      .populate('userId', 'firstName lastName');
    const activeOrders = await Order.find({ status: { $in: ['assigned', 'picked_up', 'in_transit', 'out_for_delivery'] } }).select('driverId waybillNumber status');
    const orderMap = {};
    activeOrders.forEach(o => { orderMap[String(o.driverId)] = { orderId: o._id, waybillNumber: o.waybillNumber, orderStatus: o.status }; });
    const data = drivers.map(d => ({ ...d.toObject(), firstName: d.userId?.firstName, lastName: d.userId?.lastName, ...orderMap[String(d._id)] }));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// GET /api/drivers/jobs
router.get('/jobs', authenticate, authorize('driver'), async (req, res, next) => {
  try {
    const jobs = await Order.find({
        status: 'booked',
        driverId: { $exists: false },    // not yet assigned
        $or: [
          { paymentStatus: 'paid' },
          { paymentMethod: { $in: ['cash', 'cod'] } }, // cash/COD don't need online payment
        ],
      })
      .sort({ createdAt: 1 })
      .limit(20);
    res.json({ success: true, data: jobs });
  } catch (e) { next(e); }
});

// GET /api/drivers/active-order
router.get('/active-order', authenticate, authorize('driver'), async (req, res, next) => {
  try {
    const dp    = await DriverProfile.findOne({ userId: req.user._id });
    if (!dp) return res.status(404).json({ success: false, message: 'Driver profile not found' });
    const order = await Order.findOne({ driverId: dp._id, status: { $nin: ['delivered', 'cancelled', 'returned'] } })
      .populate('customerId', 'firstName lastName phone');
    res.json({ success: true, data: order });
  } catch (e) { next(e); }
});

// GET /api/drivers/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const driver = await DriverProfile.findById(req.params.id).populate('userId', 'firstName lastName email phone');
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });
    res.json({ success: true, data: driver });
  } catch (e) { next(e); }
});

// PUT /api/drivers/status  (driver updates own)
router.put('/status', authenticate, authorize('driver'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['available', 'busy', 'offline'].includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });
    await DriverProfile.findOneAndUpdate({ userId: req.user._id }, { status });
    res.json({ success: true, data: { status } });
  } catch (e) { next(e); }
});

// PUT /api/drivers/:id/status  (admin updates a driver)
router.put('/:id/status', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    await DriverProfile.findByIdAndUpdate(req.params.id, { status });
    res.json({ success: true, data: { status } });
  } catch (e) { next(e); }
});

// PUT /api/drivers/:id/verify
router.put('/:id/verify', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await DriverProfile.findByIdAndUpdate(req.params.id, { isVerified: req.body.verified });
    res.json({ success: true, message: req.body.verified ? 'Driver verified' : 'Verification removed' });
  } catch (e) { next(e); }
});

// POST /api/drivers/location
router.post('/location', authenticate, authorize('driver'), async (req, res, next) => {
  try {
    const { lat, lng, orderId } = req.body;
    const dp = await DriverProfile.findOneAndUpdate({ userId: req.user._id }, { currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() });
    if (orderId) {
      await TrackingEvent.create({ orderId, driverId: dp._id, lat, lng });
      const io = req.app.get('io');
      io?.to(`order:${orderId}`).emit('driver:locationUpdate', { lat, lng, orderId, driverId: dp._id, timestamp: new Date() });
      io?.to('admin:room').emit('driver:locationUpdate', { lat, lng, orderId, driverId: dp._id, timestamp: new Date() });
    }
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
