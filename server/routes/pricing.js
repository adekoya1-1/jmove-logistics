/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PRICING ROUTES (Direction Matrix)
 * ─────────────────────────────────────────────────────────────────────────
 */
import { Router } from 'express';
import { State, TruckType, Pricing } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, pricingSchemas, orderSchemas } from '../middleware/validate.js';
import { calcDynamicPrice, getPublicConfig, invalidateCache } from '../services/pricingService.js';
import { STATE_DIRECTIONS, DIRECTIONS } from '../utils/pricing.js';

const router = Router();

// ══════════════════════════════════════════════════════════
//  PUBLIC ENDPOINTS
// ══════════════════════════════════════════════════════════

router.get('/config', async (req, res, next) => {
  try {
    const config = await getPublicConfig();
    res.json({ success: true, data: config });
  } catch (e) { next(e); }
});

router.post('/calculate', validate(orderSchemas.calcPrice), async (req, res, next) => {
  try {
    const pricing = await calcDynamicPrice(req.body);
    res.json({ success: true, data: pricing });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════
//  ADMIN — FULL DATA + SEED
// ══════════════════════════════════════════════════════════

router.get('/admin/full', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [states, truckTypes, rules] = await Promise.all([
      State.find().lean(),
      TruckType.find().sort({ sortOrder: 1, capacityTons: 1 }).lean(),
      Pricing.find()
        .populate('truckTypeId', 'name capacityTons icon')
        .lean(),
    ]);
    res.json({ success: true, data: { states, truckTypes, rules, directions: DIRECTIONS } });
  } catch (e) { next(e); }
});

router.post('/admin/seed-defaults', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [existingStates, existingTrucks] = await Promise.all([
      State.countDocuments(),
      TruckType.countDocuments(),
    ]);
    
    if (existingStates > 0 || existingTrucks > 0) {
      await Pricing.deleteMany({});
      await State.deleteMany({});
      await TruckType.deleteMany({});
    }

    const stateDocs = Object.entries(STATE_DIRECTIONS).map(([key, val]) => ({
      name: val.name,
      direction: val.direction
    }));

    const DEFAULT_TRUCKS = [
      { name: 'Small Van',    description: 'Up to 1 ton — parcels, documents, electronics',          capacityTons: 1,  icon: '🚐', sortOrder: 0 },
      { name: '2-Ton Truck',  description: 'Furniture, appliances, medium commercial goods',          capacityTons: 2,  icon: '🚛', sortOrder: 1 },
      { name: '5-Ton Truck',  description: 'Large commercial loads, full house or office moves',      capacityTons: 5,  icon: '��', sortOrder: 2 },
      { name: '10-Ton Truck', description: 'Heavy industrial goods and bulk freight',                 capacityTons: 10, icon: '🏗️', sortOrder: 3 },
    ];

    const states = await State.insertMany(stateDocs);
    const truckTypes = await TruckType.insertMany(DEFAULT_TRUCKS);

    // Realistic Nigerian logistics pricing matrix (₦)
    // Rows = Origin, Cols = Dest (Order: NW, NE, NC, SW, SE, SS)
    const BASE_RATES = {
      'North West':    { 'North West': 15000, 'North East': 30000, 'North Central': 35000, 'South West': 55000, 'South East': 60000, 'South South': 65000 },
      'North East':    { 'North West': 30000, 'North East': 15000, 'North Central': 40000, 'South West': 55000, 'South East': 50000, 'South South': 55000 },
      'North Central': { 'North West': 35000, 'North East': 40000, 'North Central': 15000, 'South West': 40000, 'South East': 40000, 'South South': 45000 },
      'South West':    { 'North West': 55000, 'North East': 55000, 'North Central': 40000, 'South West': 15000, 'South East': 30000, 'South South': 35000 },
      'South East':    { 'North West': 60000, 'North East': 50000, 'North Central': 40000, 'South West': 30000, 'South East': 15000, 'South South': 25000 },
      'South South':   { 'North West': 65000, 'North East': 55000, 'North Central': 45000, 'South West': 35000, 'South East': 25000, 'South South': 15000 },
    };

    const TRUCK_MUL = [1, 2, 3.5, 6];

    const rules = [];
    for (const fromDir of DIRECTIONS) {
      for (const toDir of DIRECTIONS) {
        for (let t = 0; t < truckTypes.length; t++) {
          const base = BASE_RATES[fromDir][toDir];
          const price = Math.round(base * TRUCK_MUL[t] / 1000) * 1000;
          rules.push({ fromDirection: fromDir, toDirection: toDir, truckTypeId: truckTypes[t]._id, price });
        }
      }
    }
    await Pricing.insertMany(rules);
    invalidateCache();

    res.json({
      success: true,
      message: 'Default compass directions and pricing initialised successfully',
      data: { states: states.length, trucks: truckTypes.length, rules: rules.length },
    });
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

router.post('/truck-types', authenticate, authorize('admin'), validate(pricingSchemas.createTruckType), async (req, res, next) => {
  try {
    const tt = await TruckType.create(req.body);
    invalidateCache();
    res.status(201).json({ success: true, data: tt });
  } catch (e) { next(e); }
});

router.put('/truck-types/:id', authenticate, authorize('admin'), validate(pricingSchemas.idParam, 'params'), validate(pricingSchemas.updateTruckType), async (req, res, next) => {
  try {
    const tt = await TruckType.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!tt) return res.status(404).json({ success: false, message: 'Truck type not found' });
    invalidateCache();
    res.json({ success: true, data: tt });
  } catch (e) { next(e); }
});

router.delete('/truck-types/:id', authenticate, authorize('admin'), validate(pricingSchemas.idParam, 'params'), async (req, res, next) => {
  try {
    const ruleCount = await Pricing.countDocuments({ truckTypeId: req.params.id });
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
//  PRICING RULES (Matrix Grid)
// ══════════════════════════════════════════════════════════

router.get('/rules', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const rules = await Pricing.find().populate('truckTypeId', 'name capacityTons icon').lean();
    res.json({ success: true, data: rules });
  } catch (e) { next(e); }
});

router.post('/rules', authenticate, authorize('admin'), validate(pricingSchemas.upsertRule), async (req, res, next) => {
  try {
    const { fromDirection, toDirection, truckTypeId, price } = req.body;
    const tt = await TruckType.findById(truckTypeId).lean();
    if (!tt) return res.status(404).json({ success: false, message: 'Truck type not found' });

    const rule = await Pricing.findOneAndUpdate(
      { fromDirection, toDirection, truckTypeId },
      { price: price, isActive: true },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    invalidateCache();
    res.json({ success: true, data: rule });
  } catch (e) { next(e); }
});

export default router;
