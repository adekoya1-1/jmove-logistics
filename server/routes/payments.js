import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { Order, Payment, User } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendPaymentReceipt } from '../utils/email.js';

const router = Router();
const PAYSTACK = 'https://api.paystack.co';
const headers  = () => ({ Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' });

// POST /api/payments/initialize
router.post('/initialize', authenticate, authorize('customer'), async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findOne({ _id: orderId, customerId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.paymentStatus === 'paid') return res.status(400).json({ success: false, message: 'Already paid' });

    const reference = `JMV-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const { data } = await axios.post(`${PAYSTACK}/transaction/initialize`, {
      email:     req.user.email,
      amount:    Math.round(order.totalAmount * 100),
      reference,
      metadata:  { order_id: String(order._id), order_number: order.waybillNumber, customer_name: `${req.user.firstName} ${req.user.lastName}` },
      callback_url: `${process.env.FRONTEND_URL}/payment/verify?reference=${reference}`,
    }, { headers: headers() });

    if (!data.status) return res.status(400).json({ success: false, message: 'Payment init failed' });

    await Payment.findOneAndUpdate({ orderId: order._id }, { paystackReference: reference }, { upsert: true });
    await Order.findByIdAndUpdate(orderId, { paystackReference: reference });

    res.json({ success: true, data: { authorization_url: data.data.authorization_url, reference, access_code: data.data.access_code } });
  } catch (e) {
    if (e.response?.data) return next(Object.assign(new Error(e.response.data.message || 'Payment failed'), { statusCode: 400 }));
    next(e);
  }
});

// GET /api/payments/verify
router.get('/verify', authenticate, async (req, res, next) => {
  try {
    const { reference } = req.query;
    if (!reference) return res.status(400).json({ success: false, message: 'Reference required' });

    const { data } = await axios.get(`${PAYSTACK}/transaction/verify/${reference}`, { headers: headers() });
    if (!data.status || data.data.status !== 'success')
      return res.status(400).json({ success: false, message: 'Payment not successful' });

    const tx      = data.data;
    const orderId = tx.metadata?.order_id;
    if (!orderId) return res.status(400).json({ success: false, message: 'Invalid payment metadata' });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    await Payment.findOneAndUpdate(
      { orderId },
      { status: 'paid', paystackTransactionId: String(tx.id), paidAt: new Date(), metadata: tx },
      { upsert: true }
    );
    await Order.findByIdAndUpdate(orderId, { paymentStatus: 'paid' });

    const io = req.app.get('io');
    io?.to('admin:room').emit('payment:received', { orderId, reference, amount: tx.amount / 100 });

    if (order.customerId) {
      const customer = await User.findById(order.customerId);
      if (customer) {
        sendPaymentReceipt({ email: customer.email, firstName: customer.firstName }, order, reference).catch(console.error);
      }
    } else if (order.senderEmail) {
      sendPaymentReceipt({ email: order.senderEmail, firstName: order.senderName.split(' ')[0] }, order, reference).catch(console.error);
    }

    res.json({ success: true, message: 'Payment verified', data: { orderId, amount: tx.amount / 100, reference } });
  } catch (e) {
    if (e.response?.data) return next(Object.assign(new Error(e.response.data.message || 'Verify failed'), { statusCode: 400 }));
    next(e);
  }
});

// POST /api/payments/webhook
router.post('/webhook', async (req, res, next) => {
  try {
    const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(JSON.stringify(req.body)).digest('hex');
    if (hash !== req.headers['x-paystack-signature']) return res.status(401).send('Invalid signature');

    const event = req.body;
    if (event.event === 'charge.success') {
      const { reference, metadata } = event.data;
      const orderId = metadata?.order_id;
      if (orderId) {
        await Payment.findOneAndUpdate({ paystackReference: reference }, { status: 'paid', paidAt: new Date() });
        await Order.findByIdAndUpdate(orderId, { paymentStatus: 'paid' });
      }
    }
    res.sendStatus(200);
  } catch (e) { next(e); }
});

// GET /api/payments/history
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { customerId: req.user._id };
    const payments = await Payment.find(filter)
      .populate('orderId', 'waybillNumber totalAmount originCity destinationCity')
      .populate('customerId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data: payments });
  } catch (e) { next(e); }
});

// GET /api/payments/stats
router.get('/stats', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    const days   = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[period] || 30;
    const since  = new Date(Date.now() - days * 86400000);

    const [summary, daily] = await Promise.all([
      Payment.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: null,
          totalRevenue:       { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
          successfulPayments: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
          failedPayments:     { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          avgPayment:         { $avg: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', null] } },
        }},
      ]),
      Payment.aggregate([
        { $match: { status: 'paid', paidAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } }, count: { $sum: 1 }, revenue: { $sum: '$amount' } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({ success: true, data: { summary: summary[0] || {}, daily } });
  } catch (e) { next(e); }
});

export default router;
