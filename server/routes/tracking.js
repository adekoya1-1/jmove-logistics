import { Router } from 'express';
import mongoose from 'mongoose';
import { TrackingEvent, Order } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ── GET /api/tracking/:orderId ───────────────────────────
router.get('/:orderId', authenticate, async (req, res, next) => {
  try {
    // Validate ObjectId before hitting MongoDB
    if (!mongoose.Types.ObjectId.isValid(req.params.orderId))
      return res.status(400).json({ success: false, message: 'Invalid order ID' });

    const order = await Order.findById(req.params.orderId).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Customers can only see their own orders
    if (req.user.role === 'customer' && String(order.customerId) !== String(req.user._id))
      return res.status(403).json({ success: false, message: 'Access denied' });

    const events = await TrackingEvent.find({ orderId: req.params.orderId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({ success: true, data: events });
  } catch (e) { next(e); }
});

export default router;
