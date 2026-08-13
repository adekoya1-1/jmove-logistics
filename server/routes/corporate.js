import { Router } from 'express';
import { CorporateAccount } from '../db.js';
import { authenticate, authorize, requirePermission } from '../middleware/auth.js';
import { logAction } from '../utils/auditLog.js';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const router = Router();

const corpSchema = z.object({
  companyName:       z.string().min(1).max(100).trim(),
  contactPersonName: z.string().min(1).max(100).trim(),
  contactPhone:      z.string().min(7).max(20).regex(/^[\+\d\s\-\(\)]+$/, 'Invalid phone format'),
  contactEmail:      z.string().email().max(254).optional().or(z.literal('')),
  address:           z.string().max(300).trim().optional().or(z.literal('')),
  industry:          z.string().max(100).trim().optional().or(z.literal('')),
  notes:             z.string().max(500).trim().optional().or(z.literal('')),
});

// ── GET /api/corporate ───────────────────────────────────
router.get('/', authenticate, authorize('admin'), requirePermission('orders'),
  async (req, res, next) => {
    try {
      const { search, page = 1, limit = 20 } = req.query;
      const filter = { isActive: true };
      if (search) {
        const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { companyName:       new RegExp(safe, 'i') },
          { contactPersonName: new RegExp(safe, 'i') },
          { contactPhone:      new RegExp(safe, 'i') },
        ];
      }
      const skip = (Number(page) - 1) * Number(limit);
      const [accounts, total] = await Promise.all([
        CorporateAccount.find(filter).sort({ companyName: 1 }).skip(skip).limit(Number(limit)).lean(),
        CorporateAccount.countDocuments(filter),
      ]);
      res.json({ success: true, data: { accounts, total } });
    } catch (e) { next(e); }
  }
);

// ── POST /api/corporate ──────────────────────────────────
router.post('/', authenticate, authorize('admin'), requirePermission('orders'),
  validate(corpSchema),
  async (req, res, next) => {
    try {
      const account = await CorporateAccount.create({ ...req.body, createdBy: req.user._id });
      await logAction(req, 'corporate.created', 'CorporateAccount', account._id, {
        companyName: account.companyName,
      });
      res.status(201).json({ success: true, data: account });
    } catch (e) { next(e); }
  }
);

// ── PUT /api/corporate/:id ───────────────────────────────
router.put('/:id', authenticate, authorize('admin'), requirePermission('orders'),
  validate(corpSchema),
  async (req, res, next) => {
    try {
      const account = await CorporateAccount.findByIdAndUpdate(
        req.params.id, req.body, { new: true, runValidators: true }
      );
      if (!account) return res.status(404).json({ success: false, message: 'Corporate account not found' });
      await logAction(req, 'corporate.updated', 'CorporateAccount', account._id, { companyName: account.companyName });
      res.json({ success: true, data: account });
    } catch (e) { next(e); }
  }
);

// ── DELETE /api/corporate/:id ────────────────────────────
router.delete('/:id', authenticate, authorize('admin'), requirePermission('staff'),
  async (req, res, next) => {
    try {
      const account = await CorporateAccount.findByIdAndUpdate(
        req.params.id, { isActive: false }, { new: true }
      );
      if (!account) return res.status(404).json({ success: false, message: 'Corporate account not found' });
      await logAction(req, 'corporate.deactivated', 'CorporateAccount', account._id, { companyName: account.companyName });
      res.json({ success: true, message: 'Corporate account deactivated' });
    } catch (e) { next(e); }
  }
);

export default router;
