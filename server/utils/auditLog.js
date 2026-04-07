/**
 * Audit Log Helper
 * Call logAction() from any route to record an immutable admin activity trail.
 * Never throws — failures are caught and printed to console so the main
 * request flow is never interrupted by a logging error.
 */
import { AuditLog } from '../db.js';

/**
 * @param {import('express').Request} req   - Express request (for user + IP)
 * @param {string}  action    - Dot-namespaced action  e.g. 'order.status_changed'
 * @param {string}  [entity]  - Model name             e.g. 'Order', 'Driver'
 * @param {*}       [entityId]- MongoDB ObjectId of the affected document
 * @param {object}  [details] - Diff / extra context to store
 * @param {string}  [severity]- 'info' | 'warning' | 'critical'
 */
export const logAction = async (req, action, entity = null, entityId = null, details = {}, severity = 'info') => {
  try {
    const userId = req?.user?._id;
    if (!userId) return; // unauthenticated — nothing to log

    const ip = (
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown'
    );

    await AuditLog.create({
      userId,
      action,
      entity,
      entityId: entityId || null,
      details,
      ip,
      severity,
    });
  } catch (e) {
    // Logging must never break the main request — swallow and warn
    console.error('[AuditLog] Write failed:', e.message);
  }
};
