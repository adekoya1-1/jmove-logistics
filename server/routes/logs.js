/**
 * Audit Logs Routes — /api/logs
 *
 * Read-only access to the immutable audit trail.
 * Only admins can read logs. Supports full filtering, pagination,
 * and summary statistics.
 */
import { Router } from 'express';
import { AuditLog } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── GET /api/logs/stats ──────────────────────────────────
router.get('/stats', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const since7d  = new Date(Date.now() -  7 * 86400000);
    const since24h = new Date(Date.now() -  1 * 86400000);

    const [total, last24h, last7d, bySeverity, byEntity, recentCritical] = await Promise.all([
      AuditLog.countDocuments(),
      AuditLog.countDocuments({ createdAt: { $gte: since24h } }),
      AuditLog.countDocuments({ createdAt: { $gte: since7d  } }),
      AuditLog.aggregate([
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: since7d } } },
        { $group: { _id: '$entity', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
      AuditLog.find({ severity: 'critical' })
        .populate('userId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    const severityMap = { info: 0, warning: 0, critical: 0 };
    bySeverity.forEach(s => { if (s._id) severityMap[s._id] = s.count; });

    res.json({ success: true, data: { total, last24h, last7d, bySeverity: severityMap, byEntity, recentCritical } });
  } catch (e) { next(e); }
});

// ── GET /api/logs ────────────────────────────────────────
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const {
      severity, entity, action, userId,
      page = 1, limit = 30,
      from, to,
    } = req.query;

    const pg = Math.max(1, +page);
    const lm = Math.min(100, Math.max(1, +limit));

    const filter = {};
    if (severity) filter.severity = severity;
    if (entity)   filter.entity   = entity;
    if (userId)   filter.userId   = userId;
    if (action) {
      const safe = escapeRegex(action);
      filter.action = new RegExp(safe, 'i');
    }
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }

    const total = await AuditLog.countDocuments(filter);
    const logs  = await AuditLog.find(filter)
      .populate('userId', 'firstName lastName email role')
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lm)
      .limit(lm)
      .lean();

    res.json({
      success: true,
      data: { logs, pagination: { total, page: pg, limit: lm, pages: Math.ceil(total / lm) } },
    });
  } catch (e) { next(e); }
});

export default router;
