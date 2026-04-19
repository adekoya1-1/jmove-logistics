/**
 * ─────────────────────────────────────────────────────────────
 *  PRICING ROUTES
 *  - Public:  GET /config, POST /calculate
 *  - Admin:   PricingConfig CRUD, TruckType CRUD, seed
 * ─────────────────────────────────────────────────────────────
 */
import { Router } from 'express';
import { State, TruckType, PricingConfig } from '../db.js';
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
//  ADMIN — PricingConfig (singleton)
// ══════════════════════════════════════════════════════════

// GET  /api/pricing/admin/engine — fetch the current PricingConfig document
router.get('/admin/engine', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const cfg = await PricingConfig.findOne().lean();
    res.json({ success: true, data: cfg });
  } catch (e) { next(e); }
});

// PUT  /api/pricing/admin/engine — upsert the PricingConfig singleton
router.put('/admin/engine', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const safeBody = { ...(req.body || {}) };
    delete safeBody.weightTiers;
    if (safeBody.optionalFees && typeof safeBody.optionalFees === 'object') {
      delete safeBody.optionalFees.fragilePercent;
    }
    const cfg = await PricingConfig.findOneAndUpdate(
      {},
      { $set: safeBody, $unset: { weightTiers: 1, 'optionalFees.fragilePercent': 1 } },
      { upsert: true, new: true, runValidators: true }
    );
    invalidateCache();
    res.json({ success: true, data: cfg });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════
//  ADMIN — FULL DATA + SEED
// ══════════════════════════════════════════════════════════

router.get('/admin/full', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [states, truckTypes, pricingConfig] = await Promise.all([
      State.find().lean(),
      TruckType.find().sort({ sortOrder: 1, capacityTons: 1 }).lean(),
      PricingConfig.findOne().lean(),
    ]);
    res.json({ success: true, data: { states, truckTypes, pricingConfig, directions: DIRECTIONS } });
  } catch (e) { next(e); }
});

router.post('/admin/seed-defaults', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [existingStates, existingTrucks] = await Promise.all([
      State.countDocuments(),
      TruckType.countDocuments(),
    ]);

    if (existingStates > 0 || existingTrucks > 0) {
      await State.deleteMany({});
      await TruckType.deleteMany({});
    }

    const stateDocs = Object.entries(STATE_DIRECTIONS).map(([, val]) => ({
      name: val.name,
      direction: val.direction,
    }));

    const DEFAULT_TRUCKS = [
      { name: 'Small Van',    description: 'Up to 1 ton — parcels, documents, electronics',     capacityTons: 1,  icon: '🚐', sortOrder: 0 },
      { name: '2-Ton Truck',  description: 'Furniture, appliances, medium commercial goods',     capacityTons: 2,  icon: '🚛', sortOrder: 1 },
      { name: '5-Ton Truck',  description: 'Large commercial loads, full house or office moves', capacityTons: 5,  icon: '🚚', sortOrder: 2 },
      { name: '10-Ton Truck', description: 'Heavy industrial goods and bulk freight',            capacityTons: 10, icon: '🏗️', sortOrder: 3 },
    ];

    const states     = await State.insertMany(stateDocs);
    const truckTypes = await TruckType.insertMany(DEFAULT_TRUCKS);

    // Seed the PricingConfig singleton with sensible defaults
    const baseFees = truckTypes.map(tt => ({
      truckTypeId: tt._id,
      amount:      Math.max(5000, Math.round(tt.capacityTons * 3000)),
    }));

    await PricingConfig.findOneAndUpdate(
      {},
      {
        $setOnInsert: {
          baseFees,
          distanceBands: [
            { minKm: 0,   maxKm: 30,  ratePerKm: 200, billedMinKm: 30 },
            { minKm: 31,  maxKm: 100, ratePerKm: 150, billedMinKm: 0  },
            { minKm: 101, maxKm: 300, ratePerKm: 120, billedMinKm: 0  },
            { minKm: 301, maxKm: 700, ratePerKm: 100, billedMinKm: 0  },
            { minKm: 701, maxKm: null,ratePerKm: 90,  billedMinKm: 0  },
          ],
          routeMultipliers: [
            { fromZone: 'South West',    toZone: 'South West',    multiplier: 1.0  },
            { fromZone: 'South East',    toZone: 'South East',    multiplier: 1.0  },
            { fromZone: 'South South',   toZone: 'South South',   multiplier: 1.0  },
            { fromZone: 'North Central', toZone: 'North Central', multiplier: 1.0  },
            { fromZone: 'North West',    toZone: 'North West',    multiplier: 1.0  },
            { fromZone: 'North East',    toZone: 'North East',    multiplier: 1.0  },
            { fromZone: 'South West',    toZone: 'South East',    multiplier: 1.1  },
            { fromZone: 'South East',    toZone: 'South West',    multiplier: 1.1  },
            { fromZone: 'South West',    toZone: 'South South',   multiplier: 1.15 },
            { fromZone: 'South South',   toZone: 'South West',    multiplier: 1.15 },
            { fromZone: 'South East',    toZone: 'South South',   multiplier: 1.1  },
            { fromZone: 'South South',   toZone: 'South East',    multiplier: 1.1  },
            { fromZone: 'North Central', toZone: 'South West',    multiplier: 1.2  },
            { fromZone: 'South West',    toZone: 'North Central', multiplier: 1.2  },
            { fromZone: 'North Central', toZone: 'South East',    multiplier: 1.2  },
            { fromZone: 'South East',    toZone: 'North Central', multiplier: 1.2  },
            { fromZone: 'North Central', toZone: 'South South',   multiplier: 1.2  },
            { fromZone: 'South South',   toZone: 'North Central', multiplier: 1.2  },
            { fromZone: 'North West',    toZone: 'South West',    multiplier: 1.35 },
            { fromZone: 'South West',    toZone: 'North West',    multiplier: 1.35 },
            { fromZone: 'North West',    toZone: 'North Central', multiplier: 1.1  },
            { fromZone: 'North Central', toZone: 'North West',    multiplier: 1.1  },
            { fromZone: 'North West',    toZone: 'North East',    multiplier: 1.1  },
            { fromZone: 'North East',    toZone: 'North West',    multiplier: 1.1  },
            { fromZone: 'North East',    toZone: 'South East',    multiplier: 1.4  },
            { fromZone: 'South East',    toZone: 'North East',    multiplier: 1.4  },
            { fromZone: 'North East',    toZone: 'South South',   multiplier: 1.4  },
            { fromZone: 'South South',   toZone: 'North East',    multiplier: 1.4  },
            { fromZone: 'North West',    toZone: 'South South',   multiplier: 1.5  },
            { fromZone: 'South South',   toZone: 'North West',    multiplier: 1.5  },
            { fromZone: 'North West',    toZone: 'South East',    multiplier: 1.45 },
            { fromZone: 'South East',    toZone: 'North West',    multiplier: 1.45 },
            { fromZone: 'North East',    toZone: 'North Central', multiplier: 1.15 },
            { fromZone: 'North Central', toZone: 'North East',    multiplier: 1.15 },
            { fromZone: 'North East',    toZone: 'South West',    multiplier: 1.45 },
            { fromZone: 'South West',    toZone: 'North East',    multiplier: 1.45 },
          ],
          deliveryFees:  { doorDelivery: 1500, depotPickup: 0 },
          optionalFees:  { insurancePercent: 1, expressFee: 2000, samedayFee: 3000 },
          minimumCharge: 5000,
        },
        $unset: { weightTiers: 1, 'optionalFees.fragilePercent': 1 },
      },
      { upsert: true, new: true }
    );

    invalidateCache();

    res.json({
      success: true,
      message: 'States, truck types, and pricing config seeded successfully',
      data: { states: states.length, trucks: truckTypes.length },
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
    const tt = await TruckType.findById(req.params.id);
    if (!tt) return res.status(404).json({ success: false, message: 'Truck type not found' });
    await TruckType.findByIdAndUpdate(req.params.id, { isActive: false });
    invalidateCache();
    res.json({ success: true, message: 'Truck type deactivated' });
  } catch (e) { next(e); }
});

export default router;
