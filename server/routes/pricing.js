/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PRICING ROUTES
 *
 *  Public (no auth required):
 *    GET  /api/pricing/config           → zones + truckTypes + hasDynamic flag
 *    POST /api/pricing/calculate        → price calculation with truckType
 *
 *  Admin only:
 *    GET  /api/pricing/admin/full       → full matrix data
 *    POST /api/pricing/admin/seed-defaults → seed starter zones/trucks/rules
 *    CRUD /api/pricing/zones
 *    CRUD /api/pricing/truck-types
 *    POST /api/pricing/rules            → upsert rule
 *    PUT  /api/pricing/rules/:id
 *    DELETE /api/pricing/rules/:id
 * ─────────────────────────────────────────────────────────────────────────
 */
import { Router } from 'express';
import { Zone, TruckType, PricingRule } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, pricingSchemas, orderSchemas } from '../middleware/validate.js';
import { calcDynamicPrice, getPublicConfig, invalidateCache } from '../services/pricingService.js';

const router = Router();

// ══════════════════════════════════════════════════════════
//  PUBLIC ENDPOINTS
// ══════════════════════════════════════════════════════════

// GET /api/pricing/config
router.get('/config', async (req, res, next) => {
  try {
    const config = await getPublicConfig();
    res.json({ success: true, data: config });
  } catch (e) { next(e); }
});

// POST /api/pricing/calculate
router.post('/calculate', validate(orderSchemas.calcPrice), async (req, res, next) => {
  try {
    const pricing = await calcDynamicPrice(req.body);
    res.json({ success: true, data: pricing });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════
//  ADMIN — FULL DATA + SEED
// ══════════════════════════════════════════════════════════

// GET /api/pricing/admin/full
router.get('/admin/full', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [zones, truckTypes, rules] = await Promise.all([
      Zone.find().sort({ zoneNumber: 1 }).lean(),
      TruckType.find().sort({ sortOrder: 1, capacityTons: 1 }).lean(),
      PricingRule.find()
        .populate('fromZoneId',      'name states')
        .populate('toZoneId',        'name states')
        .populate('truckTypeId', 'name capacityTons icon')
        .lean(),
    ]);
    res.json({ success: true, data: { zones, truckTypes, rules } });
  } catch (e) { next(e); }
});

// POST /api/pricing/admin/seed-defaults
router.post('/admin/seed-defaults', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [existingZones, existingTrucks] = await Promise.all([
      Zone.countDocuments(),
      TruckType.countDocuments(),
    ]);
    if (existingZones > 0 || existingTrucks > 0) {
      return res.status(409).json({
        success: false,
        message: 'Pricing config already exists. Clear existing zones and truck types before re-seeding.',
      });
    }

    const DEFAULT_ZONES = [
      { name: 'South West', states: ['lagos','ogun','oyo','osun','ondo','ekiti'], sortOrder: 0 },
      { name: 'South East', states: ['enugu','anambra','ebonyi','imo','abia'], sortOrder: 1 },
      { name: 'South South', states: ['rivers','delta','akwa_ibom','cross_river','bayelsa','edo'], sortOrder: 2 },
      { name: 'North Central', states: ['kogi','kwara','plateau','niger','benue','nasarawa','fct'], sortOrder: 3 },
      { name: 'North East', states: ['borno','adamawa','yobe','taraba','bauchi','gombe'], sortOrder: 4 },
      { name: 'North West', states: ['kano','kaduna','katsina','jigawa','kebbi','sokoto','zamfara'], sortOrder: 5 },
    ];
    const DEFAULT_TRUCKS = [
      { name: 'Small Van',    description: 'Up to 1 ton — parcels, documents, electronics', capacityTons: 1,  icon: '🚐', sortOrder: 0 },
      { name: '2-Ton Truck',  description: 'Furniture, appliances, medium commercial goods',  capacityTons: 2,  icon: '🚛', sortOrder: 1 },
      { name: '5-Ton Truck',  description: 'Large commercial loads, full house or office moves', capacityTons: 5, icon: '🚚', sortOrder: 2 },
      { name: '10-Ton Truck', description: 'Heavy industrial goods and bulk freight',          capacityTons: 10, icon: '🏗️', sortOrder: 3 },
    ];

    const zones      = await Zone.insertMany(DEFAULT_ZONES);
    const truckTypes = await TruckType.insertMany(DEFAULT_TRUCKS);

    const rules = [];
    for (let o = 0; o < zones.length; o++) {
      for (let d = 0; d < zones.length; d++) {
        for (let t = 0; t < truckTypes.length; t++) {
           let base = 5000 + (t * 5000); 
           if (o !== d) base += 20000;
           rules.push({ fromZoneId: zones[o]._id, toZoneId: zones[d]._id, truckTypeId: truckTypes[t]._id, price: base });
        }
      }
    }
    await PricingRule.insertMany(rules);
    invalidateCache();

    res.json({
      success: true,
      message: 'Default pricing initialised successfully',
      data: { zones: zones.length, truckTypes: truckTypes.length, rules: rules.length },
    });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════
//  ZONES CRUD
// ══════════════════════════════════════════════════════════

router.get('/zones', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const zones = await Zone.find().sort({ sortOrder: 1 }).lean();
    res.json({ success: true, data: zones });
  } catch (e) { next(e); }
});

router.post('/zones', authenticate, authorize('admin'),
  validate(pricingSchemas.createZone), async (req, res, next) => {
  try {
    const zone = await Zone.create(req.body);
    invalidateCache();
    res.status(201).json({ success: true, data: zone });
  } catch (e) { next(e); }
});

router.put('/zones/:id', authenticate, authorize('admin'),
  validate(pricingSchemas.idParam, 'params'),
  validate(pricingSchemas.updateZone),
  async (req, res, next) => {
  try {
    const zone = await Zone.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    invalidateCache();
    res.json({ success: true, data: zone });
  } catch (e) { next(e); }
});

router.delete('/zones/:id', authenticate, authorize('admin'),
  validate(pricingSchemas.idParam, 'params'), async (req, res, next) => {
  try {
    const ruleCount = await PricingRule.countDocuments({ $or: [{ fromZoneId: req.params.id }, { toZoneId: req.params.id }] });
    if (ruleCount > 0) {
      await Zone.findByIdAndUpdate(req.params.id, { isActive: false });
      invalidateCache();
      return res.json({ success: true, message: `Zone deactivated (${ruleCount} linked rules preserved)` });
    }
    await Zone.findByIdAndDelete(req.params.id);
    invalidateCache();
    res.json({ success: true, message: 'Zone deleted' });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════
//  TRUCK TYPES CRUD
// ══════════════════════════════════════════════════════════

router.get('/truck-types', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const types = await TruckType.find().sort({ sortOrder: 1, capacityTons: 1 }).lean();
    res.json({ success: true, data: types });
  } catch (e) { next(e); }
});

router.post('/truck-types', authenticate, authorize('admin'),
  validate(pricingSchemas.createTruckType), async (req, res, next) => {
  try {
    const tt = await TruckType.create(req.body);
    invalidateCache();
    res.status(201).json({ success: true, data: tt });
  } catch (e) { next(e); }
});

router.put('/truck-types/:id', authenticate, authorize('admin'),
  validate(pricingSchemas.idParam, 'params'),
  validate(pricingSchemas.updateTruckType),
  async (req, res, next) => {
  try {
    const tt = await TruckType.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!tt) return res.status(404).json({ success: false, message: 'Truck type not found' });
    invalidateCache();
    res.json({ success: true, data: tt });
  } catch (e) { next(e); }
});

router.delete('/truck-types/:id', authenticate, authorize('admin'),
  validate(pricingSchemas.idParam, 'params'), async (req, res, next) => {
  try {
    const ruleCount = await PricingRule.countDocuments({ truckTypeId: req.params.id });
    if (ruleCount > 0) {
      await TruckType.findByIdAndUpdate(req.params.id, { isActive: false });
      invalidateCache();
      return res.json({ success: true, message: `Truck type deactivated (${ruleCount} linked rules preserved)` });
    }
    await TruckType.findByIdAndDelete(req.params.id);
    invalidateCache();
    res.json({ success: true, message: 'Truck type deleted' });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════
//  PRICING RULES
// ══════════════════════════════════════════════════════════

router.get('/rules', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const rules = await PricingRule.find()
      .populate('fromZoneId',      'name states')
      .populate('toZoneId',        'name states')
      .populate('truckTypeId', 'name capacityTons icon')
      .lean();
    res.json({ success: true, data: rules });
  } catch (e) { next(e); }
});

// POST upserts: creates if not exists, updates if already set
router.post('/rules', authenticate, authorize('admin'),
  validate(pricingSchemas.upsertRule), async (req, res, next) => {
  try {
    const { fromZoneId, toZoneId, truckTypeId, price } = req.body;
    const [fromZ, toZ, tt] = await Promise.all([
      Zone.findById(fromZoneId).lean(),
      Zone.findById(toZoneId).lean(),
      TruckType.findById(truckTypeId).lean(),
    ]);
    if (!fromZ) return res.status(404).json({ success: false, message: 'Origin zone not found' });
    if (!toZ)   return res.status(404).json({ success: false, message: 'Destination zone not found' });
    if (!tt)    return res.status(404).json({ success: false, message: 'Truck type not found' });

    const rule = await PricingRule.findOneAndUpdate(
      { fromZoneId, toZoneId, truckTypeId },
      { price: price, isActive: true },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    invalidateCache();
    res.json({ success: true, data: rule });
  } catch (e) { next(e); }
});

router.put('/rules/:id', authenticate, authorize('admin'),
  validate(pricingSchemas.idParam, 'params'),
  validate(pricingSchemas.updateRule),
  async (req, res, next) => {
  try {
    const rule = await PricingRule.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!rule) return res.status(404).json({ success: false, message: 'Pricing rule not found' });
    invalidateCache();
    res.json({ success: true, data: rule });
  } catch (e) { next(e); }
});

router.delete('/rules/:id', authenticate, authorize('admin'),
  validate(pricingSchemas.idParam, 'params'), async (req, res, next) => {
  try {
    await PricingRule.findByIdAndDelete(req.params.id);
    invalidateCache();
    res.json({ success: true, message: 'Pricing rule removed' });
  } catch (e) { next(e); }
});

export default router;
