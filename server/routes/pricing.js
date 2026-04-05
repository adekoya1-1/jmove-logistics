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
        .populate('zoneId',      'name zoneNumber')
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
      { name: 'Local / Intrastate', description: 'Same-city deliveries', zoneNumber: 0, cities: ['lagos','lekki','abeokuta','abuja','kano','ibadan','portharcourt','enugu','benin','owerri','onitsha','asaba','warri','kaduna','jos','ilorin','uyo','calabar','maiduguri','sokoto','yola','akure'], sortOrder: 0 },
      { name: 'Zone 1 — Lagos Metro', description: 'Lagos and immediate surroundings', zoneNumber: 1, cities: ['lagos','lekki','abeokuta'], sortOrder: 1 },
      { name: 'Zone 2 — South West / South East', description: 'Abuja, Port Harcourt, Ibadan, Enugu and nearby cities', zoneNumber: 2, cities: ['abuja','portharcourt','ibadan','enugu','benin','owerri','onitsha','asaba','ilorin','akure'], sortOrder: 2 },
      { name: 'Zone 3 — North Central / South South', description: 'Warri, Kaduna, Jos, Uyo, Calabar, Kano', zoneNumber: 3, cities: ['warri','kaduna','jos','uyo','calabar','kano'], sortOrder: 3 },
      { name: 'Zone 4 — Far North / Remote', description: 'Maiduguri, Sokoto, Yola and remote areas', zoneNumber: 4, cities: ['maiduguri','sokoto','yola'], sortOrder: 4 },
    ];
    const DEFAULT_TRUCKS = [
      { name: 'Small Van',    description: 'Up to 1 ton — parcels, documents, electronics', capacityTons: 1,  icon: '🚐', sortOrder: 0 },
      { name: '2-Ton Truck',  description: 'Furniture, appliances, medium commercial goods',  capacityTons: 2,  icon: '🚛', sortOrder: 1 },
      { name: '5-Ton Truck',  description: 'Large commercial loads, full house or office moves', capacityTons: 5, icon: '🚚', sortOrder: 2 },
      { name: '10-Ton Truck', description: 'Heavy industrial goods and bulk freight',          capacityTons: 10, icon: '🏗️', sortOrder: 3 },
    ];

    const zones      = await Zone.insertMany(DEFAULT_ZONES);
    const truckTypes = await TruckType.insertMany(DEFAULT_TRUCKS);

    // Seed the full 5×4 pricing matrix
    const MATRIX = [
      // [zoneIdx, truckIdx, basePrice, pricePerKm]
      [0,0, 1500,0], [0,1, 2500,0], [0,2, 4000,0],  [0,3, 7000,0],
      [1,0, 2500,0], [1,1, 3500,0], [1,2, 6000,0],  [1,3,10000,0],
      [2,0, 3500,0], [2,1, 5000,0], [2,2, 8500,0],  [2,3,14000,0],
      [3,0, 5000,0], [3,1, 7500,0], [3,2,12000,0],  [3,3,20000,0],
      [4,0, 7500,0], [4,1,10000,0], [4,2,16000,0],  [4,3,28000,0],
    ];
    await PricingRule.insertMany(
      MATRIX.map(([zi, ti, basePrice, pricePerKm]) => ({
        zoneId: zones[zi]._id, truckTypeId: truckTypes[ti]._id, basePrice, pricePerKm,
      }))
    );
    invalidateCache();

    res.json({
      success: true,
      message: 'Default pricing initialised successfully',
      data: { zones: zones.length, truckTypes: truckTypes.length, rules: MATRIX.length },
    });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════
//  ZONES CRUD
// ══════════════════════════════════════════════════════════

router.get('/zones', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const zones = await Zone.find().sort({ zoneNumber: 1 }).lean();
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
    const ruleCount = await PricingRule.countDocuments({ zoneId: req.params.id });
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
      .populate('zoneId',      'name zoneNumber')
      .populate('truckTypeId', 'name capacityTons icon')
      .lean();
    res.json({ success: true, data: rules });
  } catch (e) { next(e); }
});

// POST upserts: creates if not exists, updates if already set
router.post('/rules', authenticate, authorize('admin'),
  validate(pricingSchemas.upsertRule), async (req, res, next) => {
  try {
    const { zoneId, truckTypeId, basePrice, pricePerKm } = req.body;
    const [zone, tt] = await Promise.all([
      Zone.findById(zoneId).lean(),
      TruckType.findById(truckTypeId).lean(),
    ]);
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    if (!tt)   return res.status(404).json({ success: false, message: 'Truck type not found' });

    const rule = await PricingRule.findOneAndUpdate(
      { zoneId, truckTypeId },
      { basePrice, pricePerKm: pricePerKm || 0, isActive: true },
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
