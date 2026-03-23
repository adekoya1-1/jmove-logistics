import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { Order, Payment, User, DriverProfile } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { calcPrice, getCityList } from '../utils/pricing.js';
import { sendOrderConfirmation, sendOrderUpdate, sendDriverAssignment } from '../utils/email.js';

const router = Router();

// Generate waybill: JMV-LAG-20240318-0001
const genWaybill = (originCity) => {
  const prefix  = 'JMV';
  const city    = (originCity || 'NG').slice(0,3).toUpperCase();
  const date    = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const rand    = Math.random().toString(36).substring(2,6).toUpperCase();
  return `${prefix}${city}${date}${rand}`;
};

// GET /api/orders/cities — list of supported cities
router.get('/cities', (req, res) => {
  res.json({ success: true, data: getCityList() });
});

// POST /api/orders/calculate-price
router.post('/calculate-price', async (req, res, next) => {
  try {
    const { originCity, destinationCity, weight, serviceType, isFragile, declaredValue } = req.body;
    if (!originCity || !destinationCity || !weight)
      return res.status(400).json({ success: false, message: 'Origin city, destination city and weight are required' });
    const pricing = calcPrice({ originCity, destinationCity, weight, serviceType, isFragile, declaredValue });
    res.json({ success: true, data: pricing });
  } catch (e) { next(e); }
});

// POST /api/orders/track — public waybill tracking (no auth needed)
router.get('/track/:waybill', async (req, res, next) => {
  try {
    const order = await Order.findOne({ waybillNumber: req.params.waybill.toUpperCase() })
      .select('-customerId -paystackReference -staffNotes');
    if (!order) return res.status(404).json({ success: false, message: 'Waybill not found. Check the number and try again.' });
    res.json({ success: true, data: order });
  } catch (e) { next(e); }
});

// POST /api/orders — customer self-books or admin/staff creates
router.post('/', authenticate, [
  body('senderName').trim().notEmpty(),
  body('senderPhone').trim().notEmpty(),
  body('receiverName').trim().notEmpty(),
  body('receiverPhone').trim().notEmpty(),
  body('receiverAddress').trim().notEmpty(),
  body('originCity').trim().notEmpty(),
  body('destinationCity').trim().notEmpty(),
  body('description').trim().notEmpty(),
  body('weight').isFloat({ min: 0.1 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const {
      senderName, senderPhone, senderEmail, senderAddress,
      receiverName, receiverPhone, receiverEmail, receiverAddress,
      originCity, destinationCity,
      description, weight, quantity, category, isFragile, declaredValue, specialInstructions,
      serviceType, paymentMethod, codAmount,
      pickupLat, pickupLng, deliveryLat, deliveryLng,
      staffNotes,
    } = req.body;

    const pricing = calcPrice({ originCity, destinationCity, weight, serviceType, isFragile, declaredValue });

    const isStaff = ['admin'].includes(req.user.role);

    const order = await Order.create({
      waybillNumber:  genWaybill(originCity),
      customerId:     req.user.role === 'customer' ? req.user._id : null,
      createdByStaff: isStaff ? req.user._id : null,

      senderName, senderPhone, senderEmail: senderEmail || req.user.email, senderAddress,
      originCity,
      receiverName, receiverPhone, receiverEmail, receiverAddress,
      destinationCity,

      description, weight: +weight, quantity: +quantity || 1,
      category: category || 'general', isFragile: !!isFragile,
      declaredValue: +declaredValue || 0, specialInstructions,

      serviceType: serviceType || 'standard',
      deliveryType:     pricing.deliveryType,
      estimatedDelivery: pricing.estimatedDelivery,

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
      staffNotes,

      statusHistory: [{ toStatus: 'booked', changedBy: req.user._id }],
    });

    // Create payment record for online payments
    if (paymentMethod === 'online' || !paymentMethod) {
      await Payment.create({ orderId: order._id, customerId: req.user._id, amount: pricing.totalAmount });
    }

    // Send confirmation
    const recipientEmail = senderEmail || req.user.email;
    if (recipientEmail) {
      sendOrderConfirmation({ email: recipientEmail, firstName: senderName.split(' ')[0] }, order).catch(console.error);
    }

    res.status(201).json({ success: true, message: 'Shipment booked', data: { order, pricing } });
  } catch (e) { next(e); }
});

// GET /api/orders
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 15, search, deliveryType, serviceType } = req.query;
    const filter = {};

    if (req.user.role === 'customer') filter.customerId = req.user._id;
    if (status)       filter.status = status;
    if (deliveryType) filter.deliveryType = deliveryType;
    if (serviceType)  filter.serviceType = serviceType;
    if (search)       filter.$or = [
      { waybillNumber:  new RegExp(search, 'i') },
      { senderName:     new RegExp(search, 'i') },
      { receiverName:   new RegExp(search, 'i') },
      { receiverAddress:new RegExp(search, 'i') },
      { originCity:     new RegExp(search, 'i') },
      { destinationCity:new RegExp(search, 'i') },
    ];

    const total  = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .populate('customerId', 'firstName lastName email phone')
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName phone' } })
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit);

    res.json({ success: true, data: { orders, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } } });
  } catch (e) { next(e); }
});

// GET /api/orders/stats
router.get('/stats', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [summary, byType, byService, daily] = await Promise.all([
      Order.aggregate([{ $group: { _id: null,
        total:           { $sum: 1 },
        booked:          { $sum: { $cond: [{ $eq: ['$status','booked']},1,0] } },
        inTransit:       { $sum: { $cond: [{ $eq: ['$status','in_transit']},1,0] } },
        delivered:       { $sum: { $cond: [{ $eq: ['$status','delivered']},1,0] } },
        cancelled:       { $sum: { $cond: [{ $eq: ['$status','cancelled']},1,0] } },
        totalRevenue:    { $sum: { $cond: [{ $eq: ['$paymentStatus','paid']},'$totalAmount',0] } },
        avgOrderValue:   { $avg: '$totalAmount' },
      }}]),
      Order.aggregate([{ $group: { _id: '$deliveryType', count: { $sum: 1 } } }]),
      Order.aggregate([{ $group: { _id: '$serviceType', count: { $sum: 1 } } }]),
      Order.aggregate([
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, orders: { $sum: 1 }, revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus','paid'] },'$totalAmount',0] } } } },
        { $sort: { _id: 1 } }, { $limit: 30 },
      ]),
    ]);
    res.json({ success: true, data: { summary: summary[0] || {}, byType, byService, dailyRevenue: daily } });
  } catch (e) { next(e); }
});

// GET /api/orders/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customerId', 'firstName lastName email phone')
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName phone' } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (req.user.role === 'customer' && String(order.customerId?._id) !== String(req.user._id))
      return res.status(403).json({ success: false, message: 'Access denied' });
    const payment = await Payment.findOne({ orderId: order._id }).select('status paystackReference paidAt');
    res.json({ success: true, data: { order, payment } });
  } catch (e) { next(e); }
});

// PUT /api/orders/:id/cancel
router.put('/:id/cancel', authenticate, authorize('customer'), async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customerId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!['booked'].includes(order.status))
      return res.status(400).json({ success: false, message: 'Only unassigned bookings can be cancelled' });
    order.status = 'cancelled';
    order.statusHistory.push({ fromStatus: 'booked', toStatus: 'cancelled', changedBy: req.user._id });
    await order.save();
    res.json({ success: true, message: 'Order cancelled' });
  } catch (e) { next(e); }
});

// PUT /api/orders/:id/assign
router.put('/:id/assign', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { driverId } = req.body;
    const order  = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!['booked'].includes(order.status))
      return res.status(400).json({ success: false, message: 'Order cannot be assigned at this stage' });

    const driver = await DriverProfile.findOne({ _id: driverId, status: 'available' }).populate('userId', 'email firstName');
    if (!driver) return res.status(400).json({ success: false, message: 'Driver not available' });

    order.driverId   = driverId;
    order.status     = 'assigned';
    order.assignedAt = new Date();
    order.statusHistory.push({ fromStatus: 'booked', toStatus: 'assigned', changedBy: req.user._id });
    await order.save();
    await DriverProfile.findByIdAndUpdate(driverId, { status: 'busy' });

    sendDriverAssignment({ email: driver.userId.email, firstName: driver.userId.firstName }, order).catch(console.error);

    // Notify sender
    if (order.senderEmail)
      sendOrderUpdate({ email: order.senderEmail, firstName: order.senderName.split(' ')[0] }, { ...order.toObject(), status: 'assigned' }).catch(console.error);

    const io = req.app.get('io');
    io?.to(`order:${order._id}`).emit('order:assigned', { orderId: order._id, status: 'assigned' });
    io?.to('admin:room').emit('order:assigned', { orderId: order._id });

    res.json({ success: true, message: 'Driver assigned' });
  } catch (e) { next(e); }
});

// PUT /api/orders/:id/status
router.put('/:id/status', authenticate, authorize('admin', 'driver'), async (req, res, next) => {
  try {
    const { status, note, location } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (req.user.role === 'driver') {
      const dp = await DriverProfile.findOne({ userId: req.user._id });
      if (!dp || String(order.driverId) !== String(dp._id))
        return res.status(403).json({ success: false, message: 'Not your order' });
    }

    const valid = {
      assigned:         ['picked_up','cancelled'],
      picked_up:        ['in_transit'],
      in_transit:       ['out_for_delivery','delivered'],
      out_for_delivery: ['delivered','returned'],
    };

    if (!valid[order.status]?.includes(status))
      return res.status(400).json({ success: false, message: `Cannot transition from ${order.status} to ${status}` });

    const prev = order.status;
    order.status = status;
    if (status === 'picked_up')        order.pickedUpAt = new Date();
    if (status === 'delivered') {
      order.deliveredAt = new Date();
      await DriverProfile.findByIdAndUpdate(order.driverId, { status: 'available', $inc: { totalDeliveries: 1 } });
    }
    order.statusHistory.push({ fromStatus: prev, toStatus: status, changedBy: req.user._id, note, location });
    await order.save();

    if (order.senderEmail)
      sendOrderUpdate({ email: order.senderEmail, firstName: order.senderName.split(' ')[0] }, order).catch(console.error);

    const io = req.app.get('io');
    io?.to(`order:${order._id}`).emit('order:statusUpdate', { orderId: order._id, status });
    io?.to('admin:room').emit('order:statusUpdate', { orderId: order._id, status });

    res.json({ success: true, data: { status } });
  } catch (e) { next(e); }
});

export default router;
