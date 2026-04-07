/**
 * ─────────────────────────────────────────────────────────
 *  SUPPORT TICKET ROUTES
 *
 *  Customer-facing:
 *    POST   /api/support              → create ticket
 *    GET    /api/support              → list my tickets (paginated)
 *    GET    /api/support/:id          → get ticket detail
 *    POST   /api/support/:id/reply    → add message
 *    PUT    /api/support/:id/close    → close ticket (customer)
 *
 *  Admin-facing:
 *    GET    /api/support/admin/all    → list all tickets (admin)
 *    PUT    /api/support/admin/:id/status → update status / assign
 *    POST   /api/support/admin/:id/reply  → admin reply
 * ─────────────────────────────────────────────────────────
 */
import { Router } from 'express';
import { SupportTicket, Notification } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
const requireAdmin = authorize('admin');

const router = Router();
router.use(authenticate);

// ── Ticket number generator ───────────────────────────────
const genTicketNumber = async () => {
  const d     = new Date();
  const date  = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const count = await SupportTicket.countDocuments() + 1;
  return `TKT-${date}-${String(count).padStart(4,'0')}`;
};

// ─────────────────────────────────────────────────────────
//  CUSTOMER ROUTES
// ─────────────────────────────────────────────────────────

// POST /api/support — create new ticket
router.post('/', async (req, res, next) => {
  try {
    const { subject, category, body, orderId } = req.body;

    if (!subject || !subject.trim())
      return res.status(400).json({ success: false, message: 'Subject is required' });
    if (!body || !body.trim())
      return res.status(400).json({ success: false, message: 'Message body is required' });
    if (subject.trim().length > 200)
      return res.status(400).json({ success: false, message: 'Subject must be 200 characters or fewer' });
    if (body.trim().length > 2000)
      return res.status(400).json({ success: false, message: 'Message must be 2000 characters or fewer' });

    const ticketNumber = await genTicketNumber();

    const ticket = await SupportTicket.create({
      ticketNumber,
      customerId: req.user._id,
      orderId:    orderId || null,
      subject:    subject.trim(),
      category:   category || 'other',
      messages: [{
        senderId:   req.user._id,
        senderRole: req.user.role === 'admin' ? 'admin' : 'customer',
        body:       body.trim(),
      }],
    });

    res.status(201).json({
      success: true,
      message: 'Support ticket created. Our team will respond within 24 hours.',
      data: ticket,
    });
  } catch (e) { next(e); }
});

// GET /api/support — list my tickets
router.get('/', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip   = (Number(page) - 1) * Number(limit);
    const filter = { customerId: req.user._id };
    if (status) filter.status = status;

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('orderId', 'waybillNumber originCity destinationCity')
        .select('-messages'),
      SupportTicket.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { tickets, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } },
    });
  } catch (e) { next(e); }
});

// GET /api/support/:id — get single ticket with messages
router.get('/:id', async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, customerId: req.user._id })
      .populate('orderId', 'waybillNumber originCity destinationCity status')
      .populate('messages.senderId', 'firstName lastName role');

    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    res.json({ success: true, data: ticket });
  } catch (e) { next(e); }
});

// POST /api/support/:id/reply — customer adds message
router.post('/:id/reply', async (req, res, next) => {
  try {
    const { body } = req.body;
    if (!body || !body.trim())
      return res.status(400).json({ success: false, message: 'Reply cannot be empty' });
    if (body.trim().length > 2000)
      return res.status(400).json({ success: false, message: 'Reply must be 2000 characters or fewer' });

    const ticket = await SupportTicket.findOne({ _id: req.params.id, customerId: req.user._id });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (ticket.status === 'closed')
      return res.status(400).json({ success: false, message: 'This ticket is closed. Please open a new one.' });

    ticket.messages.push({
      senderId:   req.user._id,
      senderRole: 'customer',
      body:       body.trim(),
    });
    // Reopen if resolved when customer replies
    if (ticket.status === 'resolved') ticket.status = 'open';
    await ticket.save();

    const updated = await SupportTicket.findById(ticket._id)
      .populate('orderId', 'waybillNumber originCity destinationCity status')
      .populate('messages.senderId', 'firstName lastName role');

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// PUT /api/support/:id/close — customer closes resolved ticket
router.put('/:id/close', async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, customerId: req.user._id });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (ticket.status === 'closed')
      return res.status(400).json({ success: false, message: 'Ticket is already closed' });

    ticket.status   = 'closed';
    ticket.closedAt = new Date();
    await ticket.save();

    res.json({ success: true, message: 'Ticket closed. Thank you for your feedback.', data: ticket });
  } catch (e) { next(e); }
});

// ─────────────────────────────────────────────────────────
//  ADMIN ROUTES
// ─────────────────────────────────────────────────────────

// GET /api/support/admin/all — list all tickets
router.get('/admin/all', requireAdmin, async (req, res, next) => {
  try {
    const { status, priority, page = 1, limit = 20 } = req.query;
    const skip   = (Number(page) - 1) * Number(limit);
    const filter = {};
    if (status)   filter.status   = status;
    if (priority) filter.priority = priority;

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('customerId', 'firstName lastName email')
        .populate('orderId', 'waybillNumber')
        .populate('assignedTo', 'firstName lastName')
        .select('-messages'),
      SupportTicket.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { tickets, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } },
    });
  } catch (e) { next(e); }
});

// PUT /api/support/admin/:id/status — update status / assign
router.put('/admin/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const { status, priority, assignedTo } = req.body;
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    if (status)     ticket.status   = status;
    if (priority)   ticket.priority = priority;
    if (assignedTo !== undefined) ticket.assignedTo = assignedTo || null;
    if (status === 'resolved') ticket.resolvedAt = new Date();
    if (status === 'closed')   ticket.closedAt   = new Date();

    await ticket.save();

    // Notify customer when ticket is resolved
    if (status === 'resolved') {
      Notification.create({
        userId:  ticket.customerId,
        title:   `Support ticket resolved: ${ticket.ticketNumber}`,
        message: `Your support ticket "${ticket.subject}" has been resolved. Please rate your experience.`,
        type:    'support',
        relatedOrderId: ticket.orderId || null,
      }).catch(console.error);
    }

    res.json({ success: true, data: ticket });
  } catch (e) { next(e); }
});

// POST /api/support/admin/:id/reply — admin replies
router.post('/admin/:id/reply', requireAdmin, async (req, res, next) => {
  try {
    const { body } = req.body;
    if (!body || !body.trim())
      return res.status(400).json({ success: false, message: 'Reply cannot be empty' });

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (ticket.status === 'closed')
      return res.status(400).json({ success: false, message: 'Ticket is closed' });

    ticket.messages.push({
      senderId:   req.user._id,
      senderRole: req.user.staffCategory ? 'support' : 'admin',
      body:       body.trim(),
    });
    if (ticket.status === 'open') ticket.status = 'in_progress';
    await ticket.save();

    // Notify customer of new reply
    Notification.create({
      userId:  ticket.customerId,
      title:   `New reply on ticket ${ticket.ticketNumber}`,
      message: `Support has replied to your ticket: "${ticket.subject}"`,
      type:    'support',
    }).catch(console.error);

    const updated = await SupportTicket.findById(ticket._id)
      .populate('customerId', 'firstName lastName email')
      .populate('messages.senderId', 'firstName lastName role staffCategory');

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

export default router;
