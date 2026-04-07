/**
 * System Settings Routes — /api/settings
 *
 * Platform-wide configuration stored in MongoDB so admins can update
 * values without redeploying. Sensitive settings (commission rates,
 * operational limits) require super_admin category.
 */
import { Router } from 'express';
import { SystemSetting } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../utils/auditLog.js';

const router = Router();

// ── Default settings catalogue ───────────────────────────
export const DEFAULT_SETTINGS = [
  // ── General
  { key: 'company_name',       value: 'JMove Logistics', label: 'Company Name',         category: 'general',       valueType: 'string',  isPublic: true,  description: 'Company name displayed across the platform' },
  { key: 'support_email',      value: 'support@jmove.ng', label: 'Support Email',        category: 'general',       valueType: 'string',  isPublic: true,  description: 'Customer-facing support email address' },
  { key: 'support_phone',      value: '08012345678',      label: 'Support Phone',        category: 'general',       valueType: 'string',  isPublic: true,  description: 'Customer-facing support phone number' },
  { key: 'maintenance_mode',   value: false,              label: 'Maintenance Mode',     category: 'general',       valueType: 'boolean', isPublic: true,  description: 'Show maintenance banner to all users' },
  // ── Pricing
  { key: 'driver_commission_pct', value: 15,              label: 'Driver Commission (%)',category: 'pricing',       valueType: 'number',  isPublic: false, description: '% of order amount credited to driver on delivery' },
  { key: 'max_weight_kg',      value: 5000,               label: 'Max Weight (kg)',      category: 'pricing',       valueType: 'number',  isPublic: true,  description: 'Maximum shipment weight accepted' },
  { key: 'min_order_amount',   value: 500,                label: 'Minimum Order (₦)',    category: 'pricing',       valueType: 'number',  isPublic: true,  description: 'Minimum order value in Naira' },
  { key: 'insurance_rate_pct', value: 1.5,                label: 'Insurance Rate (%)',   category: 'pricing',       valueType: 'number',  isPublic: false, description: 'Insurance fee as % of declared value' },
  { key: 'insurance_min_fee',  value: 500,                label: 'Insurance Min Fee (₦)',category: 'pricing',       valueType: 'number',  isPublic: false, description: 'Minimum insurance fee per shipment' },
  // ── Notifications
  { key: 'enable_email_notif', value: true,               label: 'Email Notifications',  category: 'notifications', valueType: 'boolean', isPublic: false, description: 'Send transactional emails to customers' },
  { key: 'enable_sms_notif',   value: false,              label: 'SMS Notifications',    category: 'notifications', valueType: 'boolean', isPublic: false, description: 'Send SMS alerts (requires SMS provider config)' },
  { key: 'notify_on_assign',   value: true,               label: 'Notify on Assignment', category: 'notifications', valueType: 'boolean', isPublic: false, description: 'Notify customer when a driver is assigned' },
  { key: 'notify_on_delivery', value: true,               label: 'Notify on Delivery',   category: 'notifications', valueType: 'boolean', isPublic: false, description: 'Notify customer when shipment is delivered' },
  // ── Operations
  { key: 'max_login_attempts', value: 5,                  label: 'Max Login Attempts',   category: 'operations',    valueType: 'number',  isPublic: false, description: 'Failed login attempts before account lockout (30 min)' },
  { key: 'order_auto_assign',  value: false,              label: 'Auto-assign Drivers',  category: 'operations',    valueType: 'boolean', isPublic: false, description: 'Automatically assign nearest available driver to new orders' },
  { key: 'business_hours_start', value: '08:00',          label: 'Business Hours Start', category: 'operations',    valueType: 'string',  isPublic: true,  description: 'Start of daily business hours (24h format)' },
  { key: 'business_hours_end',   value: '18:00',          label: 'Business Hours End',   category: 'operations',    valueType: 'string',  isPublic: true,  description: 'End of daily business hours (24h format)' },
  { key: 'max_orders_per_driver', value: 3,               label: 'Max Active Orders/Driver', category: 'operations', valueType: 'number', isPublic: false, description: 'Maximum concurrent active orders a driver can hold' },
];

// ── GET /api/settings/public ─────────────────────────────
// Returns only public settings — used by frontend for UI config, no auth required
router.get('/public', async (req, res, next) => {
  try {
    const settings = await SystemSetting.find({ isPublic: true }).select('-updatedBy -__v').lean();
    const map = {};
    settings.forEach(s => { map[s.key] = s.value; });
    res.json({ success: true, data: map });
  } catch (e) { next(e); }
});

// ── POST /api/settings/seed ──────────────────────────────
router.post('/seed', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    let created = 0;
    for (const s of DEFAULT_SETTINGS) {
      const exists = await SystemSetting.findOne({ key: s.key });
      if (!exists) {
        await SystemSetting.create(s);
        created++;
      }
    }
    await logAction(req, 'settings.seeded', 'SystemSetting', null, { created });
    res.json({ success: true, message: `Seeded ${created} default settings`, data: { created } });
  } catch (e) { next(e); }
});

// ── GET /api/settings ────────────────────────────────────
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const settings = await SystemSetting.find()
      .populate('updatedBy', 'firstName lastName')
      .sort({ category: 1, key: 1 })
      .lean();
    res.json({ success: true, data: settings });
  } catch (e) { next(e); }
});

// ── PUT /api/settings/:key ───────────────────────────────
router.put('/:key', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { key }   = req.params;
    const { value } = req.body;

    if (value === undefined || value === null)
      return res.status(400).json({ success: false, message: 'value is required' });

    const setting = await SystemSetting.findOne({ key });
    if (!setting)
      return res.status(404).json({ success: false, message: `Setting '${key}' not found. Run seed first.` });

    // Sensitive settings require super_admin
    const SUPER_ONLY = ['driver_commission_pct','insurance_rate_pct','insurance_min_fee','max_login_attempts'];
    if (SUPER_ONLY.includes(key) && req.user.staffCategory !== 'super_admin')
      return res.status(403).json({ success: false, message: 'Only super admins can modify this setting' });

    // Type coercion
    let coerced = value;
    if (setting.valueType === 'number') {
      coerced = Number(value);
      if (isNaN(coerced)) return res.status(400).json({ success: false, message: 'Value must be a number' });
    }
    if (setting.valueType === 'boolean') {
      coerced = value === true || value === 'true' || value === 1;
    }

    const prev = setting.value;
    setting.value     = coerced;
    setting.updatedBy = req.user._id;
    await setting.save();

    await logAction(req, 'settings.updated', 'SystemSetting', setting._id,
      { key, label: setting.label, prev, updated: coerced }, 'warning');

    res.json({ success: true, message: `'${setting.label || key}' updated successfully`, data: setting });
  } catch (e) { next(e); }
});

export default router;
