import { Router } from 'express';
import { TrackingEvent, Order } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/tracking/:orderId
router.get('/:orderId', authenticate, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (req.user.role === 'customer' && String(order.customerId) !== String(req.user._id))
      return res.status(403).json({ success: false, message: 'Access denied' });

    const events = await TrackingEvent.find({ orderId: req.params.orderId })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: events });
  } catch (e) { next(e); }
});

export default router;
