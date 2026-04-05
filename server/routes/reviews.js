import { Router } from 'express';
import { Review, Order, DriverProfile, Notification } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, reviewSchemas } from '../middleware/validate.js';

const router = Router();

// ── POST /api/reviews ────────────────────────────────────
router.post('/', authenticate, authorize('customer'),
  validate(reviewSchemas.submit), async (req, res, next) => {
  try {
    const { orderId, rating, comment } = req.body;

    const order = await Order.findOne({ _id: orderId, customerId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== 'delivered')
      return res.status(400).json({ success: false, message: 'You can only rate delivered orders' });
    if (!order.driverId)
      return res.status(400).json({ success: false, message: 'No driver assigned to this order' });

    if (await Review.findOne({ orderId }))
      return res.status(409).json({ success: false, message: 'You have already rated this delivery' });

    const review = await Review.create({
      orderId, customerId: req.user._id, driverId: order.driverId,
      rating: +rating, comment: comment?.trim() || '',
    });

    // Recalculate driver average rating
    const agg = await Review.aggregate([
      { $match: { driverId: order.driverId } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    if (agg[0]) {
      await DriverProfile.findByIdAndUpdate(order.driverId, { rating: Math.round(agg[0].avgRating * 10) / 10 });
    }

    const dp = await DriverProfile.findById(order.driverId);
    if (dp) {
      await Notification.create({
        userId: dp.userId, title: `New ${rating}★ Review`,
        message: `A customer rated your delivery of ${order.waybillNumber} ${rating}/5 stars.`,
        type: 'info', relatedOrderId: order._id,
      }).catch(() => {});
    }

    res.status(201).json({ success: true, message: 'Review submitted', data: review });
  } catch (e) { next(e); }
});

// ── GET /api/reviews/order/:orderId ─────────────────────
router.get('/order/:orderId', authenticate,
  validate(reviewSchemas.orderIdParam, 'params'), async (req, res, next) => {
  try {
    const review = await Review.findOne({ orderId: req.params.orderId }).lean();
    res.json({ success: true, data: review || null });
  } catch (e) { next(e); }
});

// ── GET /api/reviews/driver/:driverId ───────────────────
router.get('/driver/:driverId', authenticate, authorize('admin'),
  validate(reviewSchemas.driverIdParam, 'params'), async (req, res, next) => {
  try {
    const reviews = await Review.find({ driverId: req.params.driverId })
      .populate('customerId', 'firstName lastName')
      .populate('orderId', 'waybillNumber destinationCity')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ success: true, data: reviews });
  } catch (e) { next(e); }
});

export default router;
