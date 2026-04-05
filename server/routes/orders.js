/**
 * ─────────────────────────────────────────────────────────
 *  ORDERS ROUTE — HARDENED
 *
 *  Security fixes:
 *  1. Zod validation on every route (replaces express-validator)
 *  2. Field whitelisting via Zod .strip() — unknown fields rejected
 *  3. ObjectId validation on all :id params
 *  4. Search query sanitized (regex injection prevention via escaping)
 *  5. Customer orders filtered server-side (no ID spoofing)
 * ─────────────────────────────────────────────────────────
 */
import { Router } from 'express';
import { randomBytes } from 'crypto';
import { Order, Payment, User, DriverProfile, DriverEarning, Notification } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, validateAll, orderSchemas } from '../middleware/validate.js';
import { calcDynamicPrice } from '../services/pricingService.js';
import { getCityList } from '../utils/pricing.js';
import { sendOrderConfirmation, sendOrderUpdate, sendDriverAssignment } from '../utils/email.js';

const router = Router();

// ── Waybill generator ────────────────────────────────────
const genWaybill = (originCity) => {
  const prefix = 'JMV';
  const city   = (originCity || 'NG').slice(0, 3).toUpperCase();
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand   = randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}${city}${date}${rand}`;
};

// ── Escape user input for use in regex ───────────────────
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── GET /api/orders/cities ───────────────────────────────
router.get('/cities', (req, res) => {
  res.json({ success: true, data: getCityList() });
});

// ── POST /api/orders/calculate-price ────────────────────
router.post('/calculate-price', validate(orderSchemas.calcPrice), async (req, res, next) => {
  try {
    const pricing = await calcDynamicPrice(req.body);
    res.json({ success: true, data: pricing });
  } catch (e) { next(e); }
});

// ── GET /api/orders/track/:waybill ──────────────────────
router.get('/track/:waybill', async (req, res, next) => {
  try {
    const waybill = req.params.waybill.toUpperCase().replace(/[^A-Z0-9\-]/g, '');
    if (!waybill || waybill.length > 30)
      return res.status(400).json({ success: false, message: 'Invalid waybill format' });

    const order = await Order.findOne({ waybillNumber: waybill })
      .select('-customerId -paystackReference -staffNotes -createdByStaff')
      .lean();
    if (!order) return res.status(404).json({ success: false, message: 'Waybill not found. Check the number and try again.' });
    res.json({ success: true, data: order });
  } catch (e) { next(e); }
});

// ── POST /api/orders ─────────────────────────────────────
router.post('/', authenticate, validate(orderSchemas.create), async (req, res, next) => {
  try {
    // req.body is already stripped to only whitelisted fields by Zod
    const {
      senderName, senderPhone, senderEmail, senderAddress,
      receiverName, receiverPhone, receiverEmail, receiverAddress,
      originCity, destinationCity,
      description, weight, quantity, category, isFragile, declaredValue, specialInstructions,
      serviceType, paymentMethod, codAmount,
      pickupLat, pickupLng, deliveryLat, deliveryLng,
      staffNotes, truckTypeId,
    } = req.body;

    const pricing  = await calcDynamicPrice({ originCity, destinationCity, weight, serviceType, isFragile, declaredValue, truckTypeId });
    const isAdmin  = req.user.role === 'admin';

    const order = await Order.create({
      waybillNumber:  genWaybill(originCity),
      customerId:     req.user.role === 'customer' ? req.user._id : null,
      createdByStaff: isAdmin ? req.user._id : null,

      senderName, senderPhone,
      senderEmail: senderEmail || (req.user.email || undefined),
      senderAddress,
      originCity,

      receiverName, receiverPhone, receiverEmail, receiverAddress,
      destinationCity,

      description, weight: +weight, quantity: +quantity || 1,
      category: category || 'general', isFragile: !!isFragile,
      declaredValue: +declaredValue || 0, specialInstructions,

      serviceType: serviceType || 'standard',
      deliveryType:      pricing.deliveryType,
      estimatedDelivery: pricing.estimatedDelivery,
      truckTypeId:       pricing.truckType?._id || null,
      truckTypeName:     pricing.truckType?.name || null,

      basePrice:        pricing.basePrice,
      weightSurcharge:  pricing.weightSurcharge,
      serviceSurcharge: pricing.serviceSurcharge,
      fragileSurcharge: pricing.fragileSurcharge,
      insuranceFee:     pricing.insuranceFee,
      totalAmount:      pricing.totalAmount,

      paymentMethod:  paymentMethod || 'online',
      paymentStatus:  (paymentMethod === 'cash' || paymentMethod === 'cod') ? 'paid' : 'pending',
      codAmount:      paymentMethod === 'cod' ? +codAmount || 0 : 0,

      pickupLat, pickupLng, deliveryLat, deliveryLng,
      staffNotes: isAdmin ? staffNotes : undefined,  // only admin can set staffNotes

      statusHistory: [{ toStatus: 'booked', changedBy: req.user._id }],
    });

    if (paymentMethod === 'online' || !paymentMethod) {
      await Payment.create({ orderId: order._id, customerId: req.user._id, amount: pricing.totalAmount });
    }

    const recipientEmail = senderEmail || req.user.email;
    if (recipientEmail) {
      sendOrderConfirmation({ email: recipientEmail, firstName: senderName.split(' ')[0] }, order).catch(console.error);
    }

    // Notify drivers of new available job
    const io = req.app.get('io');
    io?.to('drivers:room').emit('job:new', {
      orderId:         order._id,
      waybillNumber:   order.waybillNumber,
      originCity:      order.originCity,
      destinationCity: order.destinationCity,
      totalAmount:     order.totalAmount,
      serviceType:     order.serviceType,
    });

    res.status(201).json({ success: true, message: 'Shipment booked', data: { order, pricing } });
  } catch (e) { next(e); }
});

// ── GET /api/orders ──────────────────────────────────────
router.get('/', authenticate, validate(orderSchemas.listQuery, 'query'), async (req, res, next) => {
  try {
    const { status, page, limit, search, deliveryType, serviceType } = req.query;
    const filter = {};

    if (req.user.role === 'customer') filter.customerId = req.user._id;
    if (status)       filter.status = status;
    if (deliveryType) filter.deliveryType = deliveryType;
    if (serviceType)  filter.serviceType = serviceType;

    if (search) {
      const safe = escapeRegex(search);  // prevent ReDoS
      filter.$or = [
        { waybillNumber:   new RegExp(safe, 'i') },
        { senderName:      new RegExp(safe, 'i') },
        { receiverName:    new RegExp(safe, 'i') },
        { originCity:      new RegExp(safe, 'i') },
        { destinationCity: new RegExp(safe, 'i') },
      ];
    }

    const total  = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .populate('customerId', 'firstName lastName email phone')
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName phone' } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({ success: true, data: { orders, pagination: { total, page, limit, pages: Math.ceil(total / limit) } } });
  } catch (e) { next(e); }
});

// ── GET /api/orders/stats ────────────────────────────────
router.get('/stats', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [summary, byType, byService, daily] = await Promise.all([
      Order.aggregate([{ $group: { _id: null,
        total:        { $sum: 1 },
        booked:       { $sum: { $cond: [{ $eq: ['$status','booked']},1,0] } },
        inTransit:    { $sum: { $cond: [{ $eq: ['$status','in_transit']},1,0] } },
        delivered:    { $sum: { $cond: [{ $eq: ['$status','delivered']},1,0] } },
        cancelled:    { $sum: { $cond: [{ $eq: ['$status','cancelled']},1,0] } },
        totalRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus','paid']},'$totalAmount',0] } },
        avgOrderValue:{ $avg: '$totalAmount' },
      }}]),
      Order.aggregate([{ $group: { _id: '$deliveryType', count: { $sum: 1 } } }]),
      Order.aggregate([{ $group: { _id: '$serviceType', count: { $sum: 1 } } }]),
      Order.aggregate([
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus','paid'] },'$totalAmount',0] } },
        }},
        { $sort: { _id: 1 } }, { $limit: 30 },
      ]),
    ]);
    res.json({ success: true, data: { summary: summary[0] || {}, byType, byService, dailyRevenue: daily } });
  } catch (e) { next(e); }
});

// ── GET /api/orders/:id ──────────────────────────────────
router.get('/:id', authenticate,
  validate(orderSchemas.idParam, 'params'), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customerId', 'firstName lastName email phone')
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName phone' } })
      .lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (req.user.role === 'customer' && String(order.customerId?._id) !== String(req.user._id))
      return res.status(403).json({ success: false, message: 'Access denied' });

    const payment = await Payment.findOne({ orderId: order._id }).select('status paystackReference paidAt').lean();

    // Strip sensitive fields for non-admin
    if (req.user.role !== 'admin') {
      const { staffNotes, createdByStaff, paystackReference, ...safeOrder } = order;
      return res.json({ success: true, data: { order: safeOrder, payment } });
    }

    res.json({ success: true, data: { order, payment } });
  } catch (e) { next(e); }
});

// ── PUT /api/orders/:id/cancel ───────────────────────────
router.put('/:id/cancel', authenticate, authorize('customer'),
  validate(orderSchemas.idParam, 'params'), async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customerId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== 'booked')
      return res.status(400).json({ success: false, message: 'Only unassigned bookings can be cancelled' });
    order.status = 'cancelled';
    order.statusHistory.push({ fromStatus: 'booked', toStatus: 'cancelled', changedBy: req.user._id });
    await order.save();
    res.json({ success: true, message: 'Order cancelled' });
  } catch (e) { next(e); }
});

// ── PUT /api/orders/:id/assign ───────────────────────────
router.put('/:id/assign', authenticate, authorize('admin'),
  validateAll({ params: orderSchemas.idParam, body: orderSchemas.assign }),
  async (req, res, next) => {
  try {
    const { driverId } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== 'booked')
      return res.status(400).json({ success: false, message: 'Order cannot be assigned at this stage' });

    const driver = await DriverProfile.findOne({ _id: driverId, status: 'available' })
      .populate('userId', 'email firstName lastName _id');
    if (!driver) return res.status(400).json({ success: false, message: 'Driver is not available' });

    order.driverId   = driverId;
    order.status     = 'assigned';
    order.assignedAt = new Date();
    order.statusHistory.push({ fromStatus: 'booked', toStatus: 'assigned', changedBy: req.user._id });
    await order.save();
    await DriverProfile.findByIdAndUpdate(driverId, { status: 'busy' });

    sendDriverAssignment({ email: driver.userId.email, firstName: driver.userId.firstName }, order).catch(console.error);

    if (order.senderEmail) {
      sendOrderUpdate({ email: order.senderEmail, firstName: order.senderName.split(' ')[0] }, { ...order.toObject(), status: 'assigned' }).catch(console.error);
    }

    // In-app notification for driver
    await Notification.create({
      userId:  driver.userId._id,
      title:   'New Job Assigned',
      message: `You have been assigned order ${order.waybillNumber} — ${order.originCity} → ${order.destinationCity}`,
      type:    'info', relatedOrderId: order._id,
    }).catch(() => {});

    const io = req.app.get('io');
    io?.to(`user:${driver.userId._id}`).emit('notification:new', { title: 'New Job Assigned', message: `Order ${order.waybillNumber} assigned to you` });
    io?.to(`order:${order._id}`).emit('order:assigned', { orderId: order._id, status: 'assigned' });
    io?.to('admin:room').emit('order:assigned', { orderId: order._id });

    res.json({ success: true, message: 'Driver assigned' });
  } catch (e) { next(e); }
});

// ── PUT /api/orders/:id/status ───────────────────────────
router.put('/:id/status', authenticate, authorize('driver'),
  validateAll({ params: orderSchemas.idParam, body: orderSchemas.statusUpdate }),
  async (req, res, next) => {
  try {
    const { status, note, location } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const dp = await DriverProfile.findOne({ userId: req.user._id });
    if (!dp || String(order.driverId) !== String(dp._id))
      return res.status(403).json({ success: false, message: 'Not your order' });

    const valid = {
      assigned:         ['picked_up', 'cancelled'],
      picked_up:        ['in_transit'],
      in_transit:       ['out_for_delivery', 'delivered'],
      out_for_delivery: ['delivered', 'returned'],
    };
    if (!valid[order.status]?.includes(status))
      return res.status(400).json({ success: false, message: `Cannot transition from ${order.status} to ${status}` });

    const prev = order.status;
    order.status = status;
    if (status === 'picked_up')  order.pickedUpAt  = new Date();
    if (status === 'delivered') {
      order.deliveredAt = new Date();
      await DriverProfile.findByIdAndUpdate(order.driverId, { status: 'available', $inc: { totalDeliveries: 1 } });

      const commission = Math.round((order.totalAmount || 0) * 0.15);
      await DriverEarning.create({
        driverId: order.driverId, orderId: order._id,
        waybillNumber: order.waybillNumber,
        orderAmount: order.totalAmount, commission,
        earnedAt: new Date(),
        originCity: order.originCity, destinationCity: order.destinationCity,
      }).catch(() => {});

      if (order.customerId) {
        await Notification.create({
          userId: order.customerId, title: 'Shipment Delivered!',
          message: `Your shipment ${order.waybillNumber} has been delivered successfully.`,
          type: 'success', relatedOrderId: order._id,
        }).catch(() => {});
        const io = req.app.get('io');
        io?.to(`user:${order.customerId}`).emit('notification:new', {
          title: 'Shipment Delivered!', message: `${order.waybillNumber} has been delivered.`,
        });
      }
    }

    order.statusHistory.push({ fromStatus: prev, toStatus: status, changedBy: req.user._id, note, location });
    await order.save();

    if (order.senderEmail) {
      sendOrderUpdate({ email: order.senderEmail, firstName: order.senderName.split(' ')[0] }, order).catch(console.error);
    }

    const io = req.app.get('io');
    io?.to(`order:${order._id}`).emit('order:statusUpdate', { orderId: order._id, status });
    io?.to('admin:room').emit('order:statusUpdate', { orderId: order._id, status });

    res.json({ success: true, data: { status } });
  } catch (e) { next(e); }
});

// ── POST /api/orders/:id/note ────────────────────────────
router.post('/:id/note', authenticate, authorize('driver', 'admin'),
  validateAll({ params: orderSchemas.idParam, body: orderSchemas.addNote }),
  async (req, res, next) => {
  try {
    const { note, location } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (req.user.role === 'driver') {
      const dp = await DriverProfile.findOne({ userId: req.user._id });
      if (!dp || String(order.driverId) !== String(dp._id))
        return res.status(403).json({ success: false, message: 'Not your order' });
    }

    const entry = { fromStatus: order.status, toStatus: order.status, changedBy: req.user._id, note: note.trim(), location: location?.trim() || '' };
    order.statusHistory.push(entry);
    await order.save();

    const io = req.app.get('io');
    io?.to('admin:room').emit('order:noteAdded', { orderId: order._id, note: note.trim(), location, timestamp: new Date() });
    io?.to(`order:${order._id}`).emit('order:noteAdded', { orderId: order._id, note: note.trim() });

    res.json({ success: true, message: 'Update sent to admin', data: entry });
  } catch (e) { next(e); }
});

export default router;
