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
import bcrypt from 'bcryptjs';
import { Order, Payment, User, DriverProfile, DriverEarning, Notification, State } from '../db.js';
import { authenticate, authorize, requirePermission } from '../middleware/auth.js';
import { validate, validateAll, orderSchemas, whatsappSchemas } from '../middleware/validate.js';
import { calcDynamicPrice } from '../services/pricingService.js';
import { getCityList } from '../utils/pricing.js';
import { sendOrderConfirmation, sendOrderUpdate, sendDriverAssignment } from '../utils/email.js';
import { logAction } from '../utils/auditLog.js';

const router = Router();

// ── Waybill generator ────────────────────────────────────
// Uses 5 random bytes (10 hex chars) — 1 trillion combinations,
// virtually zero collision chance.
const genWaybill = (originCity) => {
  const prefix = 'JMV';
  const city   = (originCity || 'NG').slice(0, 3).toUpperCase();
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand   = randomBytes(5).toString('hex').toUpperCase();
  return `${prefix}${city}${date}${rand}`;
};

// Retry order creation up to maxAttempts times on waybill collision.
// Broadened detection covers MongoDB Atlas which sometimes omits keyPattern
// and only populates keyValue, or encodes the field name only in the message.
const createOrderWithRetry = async (data, maxAttempts = 5) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await Order.create(data);
    } catch (err) {
      if (err.code === 11000) {
        // Log the full duplicate-key context so we can diagnose unknown fields
        const dupeField = Object.keys(err.keyPattern || err.keyValue || {})[0] || '(unknown)';
        console.warn(`[Order] duplicate key on field "${dupeField}" attempt ${attempt}/${maxAttempts}`, {
          keyPattern: err.keyPattern,
          keyValue:   err.keyValue,
          message:    err.message,
        });

        const isWaybillCollision =
          err.keyPattern?.waybillNumber ||
          err.keyValue?.waybillNumber   ||
          err.message?.toLowerCase().includes('waybillnumber') ||
          err.message?.toLowerCase().includes('waybill');

        if (isWaybillCollision && attempt < maxAttempts) {
          data.waybillNumber = genWaybill(data.originCity);
          continue;
        }

        // Any other duplicate-key: attach a human-readable field name to the error
        // so the global handler can produce a useful message.
        err._dupeField = dupeField;
        throw err;
      }
      throw err;
    }
  }
};

// ── Escape user input for use in regex ───────────────────
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SOURCE_LABEL = {
  website: 'Website',
  admin_walkin: 'Walk-in',
  admin_whatsapp: 'WhatsApp',
  admin_instagram: 'Instagram',
  admin_facebook: 'Facebook',
  admin_phone: 'Phone call',
  admin_other: 'Other',
};

const PAYMENT_OUTCOME = {
  pending:          { paymentMethod: 'online',   paymentStatus: 'pending', orderStatus: 'booked',          manualStatus: 'pending' },
  paid_offline:     { paymentMethod: 'cash',     paymentStatus: 'paid',    orderStatus: 'booked',          manualStatus: 'paid_offline' },
  whatsapp_contact: { paymentMethod: 'whatsapp', paymentStatus: 'pending', orderStatus: 'pending_contact', manualStatus: 'whatsapp_contact' },
  pay_later:        { paymentMethod: 'online',   paymentStatus: 'pending', orderStatus: 'booked',          manualStatus: 'pay_later' },
};

const splitName = (fullName = '') => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Customer';
  const lastName = parts.slice(1).join(' ') || 'Manual';
  return { firstName, lastName };
};

const genManualCustomerEmail = (fullName = '') => {
  const safeSlug = fullName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'customer';
  return `manual.${safeSlug}.${Date.now().toString(36)}@swifthaul.local`;
};

// ── GET /api/orders/cities ───────────────────────────────
router.get('/cities', async (req, res, next) => {
  try {
    const states = await State.find().sort({ name: 1 }).lean();
    res.json({ success: true, data: states });
  } catch (e) {
    next(e);
  }
});

// ── POST /api/orders/calculate-price ────────────────────
router.post('/calculate-price', validate(orderSchemas.calcPrice), async (req, res, next) => {
  try {
    const pricing = await calcDynamicPrice(req.body);
    res.json({ success: true, data: pricing });
  } catch (e) { 
    if (e.message === 'Service unavailable in selected state') {
      return res.status(400).json({ error: e.message });
    }
    next(e); 
  }
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
      paymentMethod, codAmount,
      pickupLat, pickupLng, deliveryLat, deliveryLng,
      staffNotes, truckTypeId,
      idempotencyKey,
    } = req.body;

    // ── Idempotency check ─────────────────────────────────────────────────
    // If this session key already exists for this customer, return the
    // existing order — safe for retries, double-clicks, and network replays.
    if (idempotencyKey) {
      const existing = await Order.findOne({
        idempotencyKey,
        customerId: req.user.role === 'customer' ? req.user._id : null,
      }).lean();

      if (existing) {
        // Ensure the payment record still exists (safe upsert in case it was lost)
        if (existing.paymentMethod === 'online') {
          await Payment.findOneAndUpdate(
            { orderId: existing._id },
            { $setOnInsert: { orderId: existing._id, customerId: req.user._id, amount: existing.totalAmount } },
            { upsert: true, new: true }
          );
        }
        return res.status(200).json({
          success:    true,
          message:    'Shipment booked',
          data:       { order: existing, pricing: null },
          idempotent: true,   // signals to client this was a safe replay
        });
      }
    }

    const pricing  = await calcDynamicPrice({ originCity, destinationCity, weight, isFragile, declaredValue, truckTypeId });
    const isAdmin  = req.user.role === 'admin';

    const order = await createOrderWithRetry({
      waybillNumber:  genWaybill(originCity),
      customerId:     req.user.role === 'customer' ? req.user._id : null,
      createdByStaff: isAdmin ? req.user._id : null,
      createdByRole:  isAdmin ? req.user.role : null,
      sourceChannel:  'website',

      senderName, senderPhone,
      senderEmail: senderEmail || (req.user.email || undefined),
      senderAddress,
      originCity,

      receiverName, receiverPhone, receiverEmail, receiverAddress,
      destinationCity,

      description, weight: +weight, quantity: +quantity || 1,
      category: category || 'general', isFragile: !!isFragile,
      declaredValue: +declaredValue || 0, specialInstructions,

      serviceType: 'standard',
      deliveryMode: 'door',
      deliveryType:      pricing.deliveryType,
      estimatedDelivery: pricing.estimatedDelivery,
      truckTypeId:       pricing.truckType?._id || null,
      truckTypeName:     pricing.truckType?.name || null,

      // Pricing fields (legacy schema fields kept for backward compat)
      basePrice:        pricing.basePrice,
      weightSurcharge:  pricing.weightSurcharge,
      serviceSurcharge: pricing.serviceSurcharge,
      fragileSurcharge: pricing.fragileSurcharge,
      insuranceFee:     pricing.insuranceFee,
      totalAmount:      pricing.totalAmount,

      // Full breakdown stored for admin/receipt display
      pricingBreakdown: pricing.breakdown,

      // For WhatsApp orders: lock the system-calculated quote immediately so it
      // can never be accidentally overwritten during admin confirmation.
      // finalPrice starts as null — set by admin on confirmation.
      systemQuote: paymentMethod === 'whatsapp' ? pricing.totalAmount : null,
      finalPrice:  null,

      paymentMethod:  paymentMethod || 'online',
      // cash/COD are paid at collection — mark paid immediately.
      // whatsapp is manual — payment confirmed later by admin.
      // online/wallet stay pending until Paystack webhook confirms.
      paymentStatus:  (paymentMethod === 'cash' || paymentMethod === 'cod') ? 'paid' : 'pending',
      codAmount:      paymentMethod === 'cod' ? +codAmount || 0 : 0,
      manualPayment:  null,

      pickupLat, pickupLng, deliveryLat, deliveryLng,
      staffNotes: isAdmin ? staffNotes : undefined,  // only admin can set staffNotes

      // WhatsApp orders start as pending_contact until admin confirms manual payment.
      // All other methods enter the fulfilment queue immediately as 'booked'.
      status: paymentMethod === 'whatsapp' ? 'pending_contact' : 'booked',
      statusHistory: [{
        toStatus:  paymentMethod === 'whatsapp' ? 'pending_contact' : 'booked',
        changedBy: req.user._id,
        note: paymentMethod === 'whatsapp' ? 'Order created — awaiting WhatsApp payment confirmation' : undefined,
      }],

      // Stored for idempotency — backend returns existing order on retry
      idempotencyKey: idempotencyKey || null,
    });

    if (paymentMethod === 'online' || !paymentMethod) {
      // upsert so a browser retry never throws a duplicate orderId error
      await Payment.findOneAndUpdate(
        { orderId: order._id },
        { $setOnInsert: { orderId: order._id, customerId: req.user._id, amount: pricing.totalAmount } },
        { upsert: true, new: true }
      );
    }

    // Email sending rules:
    //   cash / cod     → confirm immediately (payment is at collection, order is live)
    //   online / wallet → confirm AFTER Paystack verifies (payments.js /verify + /webhook)
    //   whatsapp        → confirm AFTER admin manually confirms payment (/confirm-whatsapp-payment)
    const recipientEmail = senderEmail || req.user.email;
    if (recipientEmail && (paymentMethod === 'cash' || paymentMethod === 'cod')) {
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
  } catch (e) {
    if (e.message === 'Service unavailable in selected state') {
      return res.status(400).json({ error: e.message });
    }

    // Race condition: two requests with the same idempotencyKey slipped past the
    // pre-check simultaneously. The second write lost; look up and return the winner.
    if (e.code === 11000) {
      const dupeField = Object.keys(e.keyPattern || e.keyValue || {})[0] || e._dupeField || '';
      if (dupeField === 'idempotencyKey' && idempotencyKey) {
        try {
          const existing = await Order.findOne({ idempotencyKey }).lean();
          if (existing) {
            return res.status(200).json({
              success:    true,
              message:    'Shipment booked',
              data:       { order: existing, pricing: null },
              idempotent: true,
            });
          }
        } catch (_) { /* fall through to next(e) */ }
      }
    }

    next(e);
  }
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

// ── GET /api/orders/whatsapp-pending ────────────────────
// Admin-only: returns all WhatsApp orders that are actionable
// (pending_contact or awaiting_confirmation), newest first.
router.get('/whatsapp-pending', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const orders = await Order.find({
      paymentMethod: 'whatsapp',
      status: { $in: ['pending_contact', 'awaiting_confirmation'] },
    })
      .populate('customerId', 'firstName lastName email phone')
      .sort({ createdAt: -1 })
      .lean();

    const counts = {
      total:                orders.length,
      pending_contact:      orders.filter(o => o.status === 'pending_contact').length,
      awaiting_confirmation:orders.filter(o => o.status === 'awaiting_confirmation').length,
    };

    res.json({ success: true, data: { orders, counts } });
  } catch (e) { next(e); }
});

// ── POST /api/orders/admin/manual ───────────────────────
// Admin operations can create orders on behalf of walk-ins, phone calls,
// social channels, and other offline sources. Pricing still comes from the
// same backend pricing engine used by public booking flow.
router.post('/admin/manual', authenticate, authorize('admin'), requirePermission('orders'),
  validate(orderSchemas.adminManualCreate),
  async (req, res, next) => {
    try {
      const { customer, sourceChannel, shipment, payment, adminNotes } = req.body;
      const {
        fullName, phone, email, createCustomerRecord,
      } = customer;
      const {
        pickupAddress, deliveryAddress,
        pickupContactName, pickupContactPhone,
        receiverContactName, receiverContactPhone,
        packageDescription, quantity, weight, isFragile,
        insuranceEnabled, declaredValue,
        truckTypeId, originCity, destinationCity, specialInstructions,
      } = shipment;

      const pricing = await calcDynamicPrice({
        originCity,
        destinationCity,
        truckTypeId,
        isFragile,
        declaredValue: insuranceEnabled ? declaredValue : 0,
      });

      const existingCustomer = await User.findOne({
        role: 'customer',
        $or: [
          ...(email ? [{ email: String(email).toLowerCase().trim() }] : []),
          ...(phone ? [{ phone: String(phone).trim() }] : []),
        ],
      }).select('_id').lean();

      let customerId = existingCustomer?._id || null;
      let customerCreated = false;

      if (!customerId && createCustomerRecord) {
        const { firstName, lastName } = splitName(fullName);
        let customerEmail = email ? String(email).toLowerCase().trim() : genManualCustomerEmail(fullName);

        while (await User.exists({ email: customerEmail })) {
          customerEmail = genManualCustomerEmail(fullName);
        }

        const tempPassword = randomBytes(12).toString('hex');
        const customerUser = await User.create({
          email: customerEmail,
          password: await bcrypt.hash(tempPassword, 12),
          firstName,
          lastName,
          phone: phone?.trim() || undefined,
          role: 'customer',
          emailVerified: !!email,
        });

        customerId = customerUser._id;
        customerCreated = true;
      }

      const paymentConfig = PAYMENT_OUTCOME[payment.outcome];
      const manualPaymentNote = payment.note || null;
      const fragileNote = isFragile ? 'Price will be determined upon inspection' : null;

      const order = await createOrderWithRetry({
        waybillNumber: genWaybill(originCity),
        customerId,
        createdByStaff: req.user._id,
        createdByRole: req.user.role,
        sourceChannel,

        senderName: pickupContactName,
        senderPhone: pickupContactPhone,
        senderEmail: email || undefined,
        senderAddress: pickupAddress,
        originCity,

        receiverName: receiverContactName,
        receiverPhone: receiverContactPhone,
        receiverAddress: deliveryAddress,
        destinationCity,

        description: packageDescription,
        weight: +weight,
        quantity: +quantity || 1,
        category: 'general',
        isFragile: !!isFragile,
        declaredValue: insuranceEnabled ? (+declaredValue || 0) : 0,
        specialInstructions,

        serviceType: 'standard',
        deliveryMode: 'door',
        deliveryType: pricing.deliveryType,
        estimatedDelivery: pricing.estimatedDelivery,
        truckTypeId: pricing.truckType?._id || truckTypeId,
        truckTypeName: pricing.truckType?.name || null,

        basePrice: pricing.basePrice,
        weightSurcharge: pricing.weightSurcharge,
        serviceSurcharge: pricing.serviceSurcharge,
        fragileSurcharge: pricing.fragileSurcharge,
        insuranceFee: pricing.insuranceFee,
        totalAmount: pricing.totalAmount,
        pricingBreakdown: {
          ...(pricing.breakdown || {}),
          fragileHandlingNote: fragileNote,
        },

        systemQuote: payment.outcome === 'whatsapp_contact' ? pricing.totalAmount : null,
        finalPrice: null,

        paymentMethod: paymentConfig.paymentMethod,
        paymentStatus: paymentConfig.paymentStatus,
        codAmount: 0,
        manualPayment: {
          status: paymentConfig.manualStatus,
          note: manualPaymentNote,
          recordedBy: req.user._id,
          recordedAt: new Date(),
          recordedByRole: req.user.role,
        },

        status: paymentConfig.orderStatus,
        statusHistory: [{
          toStatus: paymentConfig.orderStatus,
          changedBy: req.user._id,
          note: `Created by admin from ${SOURCE_LABEL[sourceChannel] || 'manual source'}`,
        }],

        staffNotes: adminNotes || null,
      });

      // Only create a pending online payment record when a linked customer exists.
      // This prevents fake or orphaned gateway records for manual/offline orders.
      if (paymentConfig.paymentMethod === 'online' && paymentConfig.paymentStatus === 'pending' && customerId) {
        await Payment.findOneAndUpdate(
          { orderId: order._id },
          { $setOnInsert: { orderId: order._id, customerId, amount: pricing.totalAmount } },
          { upsert: true, new: true }
        );
      }

      if (paymentConfig.orderStatus === 'booked') {
        const io = req.app.get('io');
        io?.to('drivers:room').emit('job:new', {
          orderId: order._id,
          waybillNumber: order.waybillNumber,
          originCity: order.originCity,
          destinationCity: order.destinationCity,
          totalAmount: order.totalAmount,
          serviceType: order.serviceType,
        });
      }

      await logAction(req, 'order.admin_manual_created', 'Order', order._id, {
        waybill: order.waybillNumber,
        sourceChannel,
        paymentOutcome: payment.outcome,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        totalAmount: order.totalAmount,
        linkedCustomerId: customerId,
        customerCreated,
      });

      res.status(201).json({
        success: true,
        message: 'Manual order created successfully',
        data: { order, pricing, customerLinked: !!customerId, customerCreated },
      });
    } catch (e) {
      if (e.message === 'Service unavailable in selected state') {
        return res.status(400).json({ success: false, message: e.message });
      }
      next(e);
    }
  }
);

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

    await logAction(req, 'order.driver_assigned', 'Order', order._id,
      { waybill: order.waybillNumber, driverId, driverName: `${driver.userId.firstName} ${driver.userId.lastName}` });

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

    // Notify customer for key milestones (picked_up, in_transit, out_for_delivery)
    if (order.customerId && ['picked_up','in_transit','out_for_delivery'].includes(status)) {
      const msgMap = {
        picked_up:        `Your shipment ${order.waybillNumber} has been picked up and is on the way.`,
        in_transit:       `Your shipment ${order.waybillNumber} is now in transit.`,
        out_for_delivery: `Your shipment ${order.waybillNumber} is out for delivery — expect it soon!`,
      };
      await Notification.create({
        userId: order.customerId,
        title:  status === 'out_for_delivery' ? 'Out for Delivery!' : 'Shipment Update',
        message: msgMap[status],
        type: 'info', relatedOrderId: order._id,
      }).catch(() => {});
      const io = req.app.get('io');
      io?.to(`user:${order.customerId}`).emit('notification:new', { title: 'Shipment Update', message: msgMap[status] });
    }

    if (order.senderEmail) {
      sendOrderUpdate({ email: order.senderEmail, firstName: order.senderName.split(' ')[0] }, order).catch(console.error);
    }

    await logAction(req, 'order.status_changed', 'Order', order._id,
      { waybill: order.waybillNumber, from: prev, to: status, note });

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

// ══════════════════════════════════════════════════════════
//  WHATSAPP ORDER ADMIN ACTIONS
//  All three routes are admin-only and only operate on
//  orders where paymentMethod === 'whatsapp'.
// ══════════════════════════════════════════════════════════

// ── PUT /api/orders/:id/whatsapp-advance ─────────────────
// Moves pending_contact → awaiting_confirmation.
// Use this when the customer messages saying they have sent proof of payment.
router.put('/:id/whatsapp-advance', authenticate, authorize('admin'),
  validateAll({ params: orderSchemas.idParam, body: whatsappSchemas.advance }),
  async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.paymentMethod !== 'whatsapp')
      return res.status(400).json({ success: false, message: 'This action is only for WhatsApp orders.' });
    if (order.status !== 'pending_contact')
      return res.status(400).json({ success: false, message: `Expected status "pending_contact", got "${order.status}".` });

    const note = req.body.note || 'Customer claims payment sent — awaiting admin verification';

    order.status = 'awaiting_confirmation';
    if (req.body.note) order.whatsappNote = req.body.note;
    order.statusHistory.push({
      fromStatus: 'pending_contact',
      toStatus:   'awaiting_confirmation',
      changedBy:  req.user._id,
      note,
    });
    await order.save();

    // Push real-time update to admin room
    const io = req.app.get('io');
    io?.to('admin:room').emit('whatsapp:statusUpdate', {
      orderId: order._id,
      status:  'awaiting_confirmation',
      waybill: order.waybillNumber,
    });

    await logAction(req, 'order.whatsapp_advanced', 'Order', order._id, {
      waybill: order.waybillNumber, from: 'pending_contact', to: 'awaiting_confirmation',
    });

    res.json({ success: true, message: 'Order marked as awaiting confirmation.', data: { order } });
  } catch (e) { next(e); }
});

// ── PUT /api/orders/:id/confirm-whatsapp-payment ─────────
// Admin confirms payment and activates the order.
// Accepts an optional finalPrice — if provided, the system quote is preserved
// and the order's totalAmount is updated to reflect the negotiated price.
router.put('/:id/confirm-whatsapp-payment', authenticate, authorize('admin'),
  validateAll({ params: orderSchemas.idParam, body: whatsappSchemas.confirm }),
  async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customerId', 'email firstName lastName');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.paymentMethod !== 'whatsapp')
      return res.status(400).json({ success: false, message: 'This route is only for WhatsApp payment orders.' });

    const CONFIRMABLE = ['pending_contact', 'awaiting_confirmation'];
    if (!CONFIRMABLE.includes(order.status))
      return res.status(400).json({ success: false, message: `Order is already in status "${order.status}" — cannot confirm.` });

    const { finalPrice, note } = req.body;
    const prevStatus = order.status;

    // finalPrice is validated as required by whatsappSchemas.confirm (Zod),
    // but we add an explicit guard here as a belt-and-suspenders safety net.
    if (finalPrice === undefined || finalPrice === null) {
      return res.status(400).json({
        success: false,
        message: 'Please enter the final confirmed amount before proceeding.',
      });
    }

    // Always preserve the original system quote (set at order creation).
    // If — for legacy orders — it wasn't captured then, fall back to totalAmount.
    // NEVER overwrite systemQuote once it has been set.
    if (order.systemQuote === null || order.systemQuote === undefined) {
      order.systemQuote = order.totalAmount;
    }

    // Record the actual agreed/paid amount and update totalAmount for invoicing.
    order.finalPrice  = finalPrice;
    order.totalAmount = finalPrice;

    order.status        = 'booked';
    order.paymentStatus = 'paid';
    if (note) order.whatsappNote = note;

    const priceDiff = finalPrice - order.systemQuote;
    const diffNote  = priceDiff !== 0
      ? ` (${priceDiff > 0 ? '+' : ''}₦${Math.abs(priceDiff).toLocaleString()} vs quote)`
      : ' (matched quote exactly)';

    order.statusHistory.push({
      fromStatus: prevStatus,
      toStatus:   'booked',
      changedBy:  req.user._id,
      note: note ||
        `WhatsApp payment confirmed by ${req.user.firstName} ${req.user.lastName}. ` +
        `Final: ₦${finalPrice.toLocaleString()} | Quote: ₦${order.systemQuote.toLocaleString()}${diffNote}`,
    });
    await order.save();

    // Notify drivers of the newly available job
    const io = req.app.get('io');
    io?.to('drivers:room').emit('job:new', {
      orderId:         order._id,
      waybillNumber:   order.waybillNumber,
      originCity:      order.originCity,
      destinationCity: order.destinationCity,
      totalAmount:     order.totalAmount,
      serviceType:     order.serviceType,
    });
    io?.to('admin:room').emit('whatsapp:confirmed', {
      orderId: order._id, waybill: order.waybillNumber,
    });

    // Send booking confirmation email — deferred until admin verifies payment
    const recipientEmail = order.customerId?.email || order.senderEmail;
    const firstName      = order.customerId?.firstName || order.senderName?.split(' ')[0] || 'Customer';
    if (recipientEmail) {
      sendOrderConfirmation({ email: recipientEmail, firstName }, order).catch(console.error);
    }

    await logAction(req, 'order.whatsapp_payment_confirmed', 'Order', order._id, {
      waybill:      order.waybillNumber,
      confirmedBy:  req.user._id,
      systemQuote:  order.systemQuote,
      finalPrice:   order.finalPrice,
    });

    res.json({
      success: true,
      message: 'WhatsApp payment confirmed. Order is now active.',
      data: { order },
    });
  } catch (e) { next(e); }
});

// ── PUT /api/orders/:id/whatsapp-cancel ──────────────────
// Admin cancels a WhatsApp order that is still in a pre-booked status.
router.put('/:id/whatsapp-cancel', authenticate, authorize('admin'),
  validateAll({ params: orderSchemas.idParam, body: whatsappSchemas.cancel }),
  async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customerId', 'email firstName lastName');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.paymentMethod !== 'whatsapp')
      return res.status(400).json({ success: false, message: 'This action is only for WhatsApp orders.' });

    const CANCELLABLE = ['pending_contact', 'awaiting_confirmation'];
    if (!CANCELLABLE.includes(order.status))
      return res.status(400).json({ success: false, message: `Cannot cancel an order in status "${order.status}".` });

    const reason = req.body.reason || `Cancelled by admin ${req.user.firstName} ${req.user.lastName}`;
    const prevStatus = order.status;

    order.status = 'cancelled';
    order.statusHistory.push({
      fromStatus: prevStatus,
      toStatus:   'cancelled',
      changedBy:  req.user._id,
      note:       reason,
    });
    await order.save();

    const io = req.app.get('io');
    io?.to('admin:room').emit('whatsapp:cancelled', { orderId: order._id, waybill: order.waybillNumber });

    await logAction(req, 'order.whatsapp_cancelled', 'Order', order._id, {
      waybill: order.waybillNumber, reason, prevStatus,
    });

    res.json({ success: true, message: 'WhatsApp order cancelled.', data: { order } });
  } catch (e) { next(e); }
});

export default router;
