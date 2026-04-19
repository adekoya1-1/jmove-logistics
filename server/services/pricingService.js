/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  HYBRID PRICING SERVICE
 *
 *  Formula:
 *    Total = max(minimumCharge,
 *               baseFee
 *             + distanceCost × routeMultiplier
 *             + insuranceFee)
 *
 *  All rates come from the singleton PricingConfig document in MongoDB.
 *  Falls back to hardcoded defaults if no config exists yet.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { State, TruckType, PricingConfig } from '../db.js';
import { getDistanceKm } from '../utils/distances.js';

// ── In-memory cache (60 s TTL) ────────────────────────────────────────────────
let _cache     = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60_000;

export const invalidateCache = () => { _cache = null; _cacheTime = 0; };

async function loadConfig() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;

  const [states, truckTypes, pricingConfig] = await Promise.all([
    State.find().lean(),
    TruckType.find({ isActive: true }).sort({ sortOrder: 1, capacityTons: 1 }).lean(),
    PricingConfig.findOne().lean(),
  ]);

  _cache     = { states, truckTypes, pricingConfig };
  _cacheTime = Date.now();
  return _cache;
}

// ── Default pricing config (used if no DB config exists yet) ─────────────────
const DEFAULT_CONFIG = {
  baseFees: [],   // falls back to truck capacity × 3000

  routeMultipliers: [
    // same zone → 1.0, adjacent zones → 1.1–1.2, cross-country → 1.3–1.5
    { fromZone: 'South West',   toZone: 'South West',   multiplier: 1.0 },
    { fromZone: 'South East',   toZone: 'South East',   multiplier: 1.0 },
    { fromZone: 'South South',  toZone: 'South South',  multiplier: 1.0 },
    { fromZone: 'North Central',toZone: 'North Central',multiplier: 1.0 },
    { fromZone: 'North West',   toZone: 'North West',   multiplier: 1.0 },
    { fromZone: 'North East',   toZone: 'North East',   multiplier: 1.0 },

    { fromZone: 'South West',   toZone: 'South East',   multiplier: 1.1 },
    { fromZone: 'South East',   toZone: 'South West',   multiplier: 1.1 },
    { fromZone: 'South West',   toZone: 'South South',  multiplier: 1.15},
    { fromZone: 'South South',  toZone: 'South West',   multiplier: 1.15},
    { fromZone: 'South East',   toZone: 'South South',  multiplier: 1.1 },
    { fromZone: 'South South',  toZone: 'South East',   multiplier: 1.1 },

    { fromZone: 'North Central',toZone: 'South West',   multiplier: 1.2 },
    { fromZone: 'South West',   toZone: 'North Central',multiplier: 1.2 },
    { fromZone: 'North Central',toZone: 'South East',   multiplier: 1.2 },
    { fromZone: 'South East',   toZone: 'North Central',multiplier: 1.2 },
    { fromZone: 'North Central',toZone: 'South South',  multiplier: 1.2 },
    { fromZone: 'South South',  toZone: 'North Central',multiplier: 1.2 },

    { fromZone: 'North West',   toZone: 'South West',   multiplier: 1.35},
    { fromZone: 'South West',   toZone: 'North West',   multiplier: 1.35},
    { fromZone: 'North West',   toZone: 'North Central',multiplier: 1.1 },
    { fromZone: 'North Central',toZone: 'North West',   multiplier: 1.1 },
    { fromZone: 'North West',   toZone: 'North East',   multiplier: 1.1 },
    { fromZone: 'North East',   toZone: 'North West',   multiplier: 1.1 },

    { fromZone: 'North East',   toZone: 'South East',   multiplier: 1.4 },
    { fromZone: 'South East',   toZone: 'North East',   multiplier: 1.4 },
    { fromZone: 'North East',   toZone: 'South South',  multiplier: 1.4 },
    { fromZone: 'South South',  toZone: 'North East',   multiplier: 1.4 },
    { fromZone: 'North West',   toZone: 'South South',  multiplier: 1.5 },
    { fromZone: 'South South',  toZone: 'North West',   multiplier: 1.5 },
    { fromZone: 'North West',   toZone: 'South East',   multiplier: 1.45},
    { fromZone: 'South East',   toZone: 'North West',   multiplier: 1.45},
    { fromZone: 'North East',   toZone: 'North Central',multiplier: 1.15},
    { fromZone: 'North Central',toZone: 'North East',   multiplier: 1.15},
    { fromZone: 'North East',   toZone: 'South West',   multiplier: 1.45},
    { fromZone: 'South West',   toZone: 'North East',   multiplier: 1.45},
    { fromZone: 'North West',   toZone: 'North East',   multiplier: 1.1 },
    { fromZone: 'North East',   toZone: 'North West',   multiplier: 1.1 },
    { fromZone: 'North Central',toZone: 'South South',  multiplier: 1.2 },
  ],

  optionalFees: {
    insurancePercent: 1,
  },

  minimumCharge: 5000,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const baseBandTemplate = (rateMultiplier = 1) => [
  { minKm: 0,   maxKm: 30,  ratePerKm: Math.round(200 * rateMultiplier), billedMinKm: 30 },
  { minKm: 31,  maxKm: 100, ratePerKm: Math.round(150 * rateMultiplier), billedMinKm: 0  },
  { minKm: 101, maxKm: 300, ratePerKm: Math.round(120 * rateMultiplier), billedMinKm: 0  },
  { minKm: 301, maxKm: 700, ratePerKm: Math.round(100 * rateMultiplier), billedMinKm: 0  },
  { minKm: 701, maxKm: null,ratePerKm: Math.round(90  * rateMultiplier), billedMinKm: 0  },
];

const defaultBandMultiplierForTruck = (truckType) => {
  const tons = Number(truckType?.capacityTons || 0);
  if (tons <= 1) return 0.85;
  if (tons <= 2) return 1.0;
  if (tons <= 5) return 1.2;
  return 1.45;
};

const normalizeBand = (band) => ({
  minKm: Number(band.minKm),
  maxKm: band.maxKm === null || band.maxKm === undefined || band.maxKm === '' ? null : Number(band.maxKm),
  ratePerKm: Number(band.ratePerKm),
  billedMinKm: Number(band.billedMinKm || 0),
});

const validateAndNormalizeBands = (bands = [], contextLabel = 'distance bands') => {
  if (!Array.isArray(bands) || bands.length === 0) {
    throw new Error(`${contextLabel} must contain at least one band`);
  }

  const normalized = bands.map(normalizeBand).sort((a, b) => a.minKm - b.minKm);
  let previousMax = null;

  normalized.forEach((band, idx) => {
    if (!Number.isFinite(band.minKm) || band.minKm < 0) {
      throw new Error(`${contextLabel}: band ${idx + 1} has invalid minKm`);
    }
    if (band.maxKm !== null && (!Number.isFinite(band.maxKm) || band.maxKm < band.minKm)) {
      throw new Error(`${contextLabel}: band ${idx + 1} has invalid maxKm`);
    }
    if (!Number.isFinite(band.ratePerKm) || band.ratePerKm < 0) {
      throw new Error(`${contextLabel}: band ${idx + 1} has invalid ratePerKm`);
    }
    if (!Number.isFinite(band.billedMinKm) || band.billedMinKm < 0) {
      throw new Error(`${contextLabel}: band ${idx + 1} has invalid billedMinKm`);
    }
    if (previousMax !== null && band.minKm <= previousMax) {
      throw new Error(`${contextLabel}: overlapping or unordered bands detected`);
    }
    previousMax = band.maxKm;
  });

  return normalized;
};

export const validateVehicleDistanceBandConfig = (vehicleDistanceBands = []) => {
  if (!Array.isArray(vehicleDistanceBands) || vehicleDistanceBands.length === 0) {
    throw new Error('Vehicle-specific distance bands are required');
  }

  const seen = new Set();
  return vehicleDistanceBands.map((entry, idx) => {
    const truckTypeId = entry?.truckTypeId?.toString?.() || entry?.truckTypeId;
    if (!truckTypeId) throw new Error(`Vehicle distance band entry ${idx + 1} is missing truckTypeId`);
    if (seen.has(truckTypeId)) throw new Error(`Duplicate vehicle distance band configuration for truck type ${truckTypeId}`);
    seen.add(truckTypeId);
    return {
      truckTypeId,
      bands: validateAndNormalizeBands(entry.bands || [], `Vehicle ${truckTypeId} bands`),
    };
  });
};

function findBand(distanceBands, km) {
  return distanceBands.find(b =>
    km >= b.minKm && (b.maxKm === null || km <= b.maxKm)
  );
}

function calcDistanceCost(distanceBands, rawKm) {
  const band = findBand(distanceBands, rawKm);
  if (!band) return { billedKm: rawKm, ratePerKm: 0, cost: 0, band: null };
  const billedKm = Math.max(rawKm, band.billedMinKm || 0);
  const cost = Math.round(billedKm * band.ratePerKm);
  return { billedKm, ratePerKm: band.ratePerKm, cost, band };
}

function getRouteMultiplier(routeMultipliers, fromZone, toZone) {
  const match = routeMultipliers.find(r => r.fromZone === fromZone && r.toZone === toZone)
             || routeMultipliers.find(r => r.fromZone === toZone   && r.toZone === fromZone);
  return match ? match.multiplier : 1.0;
}

function getBaseFee(baseFees, truckTypeId, truckType) {
  const entry = baseFees.find(b => b.truckTypeId?.toString() === truckTypeId.toString());
  if (entry) return entry.amount;
  // Fallback: ₦3,000 per ton of capacity, minimum ₦5,000
  return Math.max(5000, Math.round(truckType.capacityTons * 3000));
}

function resolveVehicleBands({ pc, truckTypes }) {
  // Preferred structure: vehicleDistanceBands keyed by truckTypeId
  if (pc?.vehicleDistanceBands?.length) {
    return validateVehicleDistanceBandConfig(pc.vehicleDistanceBands);
  }

  // Legacy compatibility: map old global distanceBands to each active vehicle.
  // This keeps older configs functional while moving runtime logic to
  // vehicle-specific tables only.
  if (pc?.distanceBands?.length) {
    return truckTypes.map(tt => ({
      truckTypeId: tt._id.toString(),
      bands: validateAndNormalizeBands(pc.distanceBands, `${tt.name} bands`),
    }));
  }

  // System fallback when config is empty.
  return truckTypes.map(tt => ({
    truckTypeId: tt._id.toString(),
    bands: baseBandTemplate(defaultBandMultiplierForTruck(tt)),
  }));
}

// ── Main exported calculator ──────────────────────────────────────────────────
export const calcDynamicPrice = async ({
  originCity,
  destinationCity,
  truckTypeId,
  isFragile    = false,
  declaredValue= 0,
}) => {
  if (!truckTypeId || !originCity || !destinationCity) {
    throw new Error('originCity, destinationCity, and truckTypeId are required to calculate price');
  }

  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    console.error('[PricingService] DB unavailable:', err.message);
    throw new Error('Pricing service temporarily unavailable');
  }

  const { states, truckTypes, pricingConfig } = config;
  const pc = pricingConfig || DEFAULT_CONFIG;

  // Use per-vehicle distance bands (required runtime model).
  const vehicleDistanceBands = resolveVehicleBands({ pc, truckTypes });
  const routeMultipliers = pc.routeMultipliers?.length  ? pc.routeMultipliers : DEFAULT_CONFIG.routeMultipliers;
  const optionalFees     = pc.optionalFees              || DEFAULT_CONFIG.optionalFees;
  const minimumCharge    = pc.minimumCharge             ?? DEFAULT_CONFIG.minimumCharge;
  const baseFees         = pc.baseFees                  || [];

  // ── Resolve truck type ────────────────────────────────────────────────────
  const truckType = truckTypes.find(tt => tt._id.toString() === truckTypeId.toString());
  if (!truckType) throw new Error('Selected vehicle type is invalid or inactive');

  // ── Resolve states ────────────────────────────────────────────────────────
  const originState = states.find(s =>
    s.name === originCity ||
    s.name.toLowerCase() === originCity.toLowerCase() ||
    s.name.toLowerCase().includes(originCity.toLowerCase())
  );
  const destState = states.find(s =>
    s.name === destinationCity ||
    s.name.toLowerCase() === destinationCity.toLowerCase() ||
    s.name.toLowerCase().includes(destinationCity.toLowerCase())
  );

  if (!originState) throw new Error(`Invalid pickup location: ${originCity}`);
  if (!destState)   throw new Error(`Invalid destination location: ${destinationCity}`);
  if (!originState.isActive || !destState.isActive) {
    throw new Error('Service unavailable in selected state');
  }

  const fromZone = originState.direction;
  const toZone   = destState.direction;

  // ── Distance ──────────────────────────────────────────────────────────────
  const rawKm = getDistanceKm(originState.name, destState.name);
  const deliveryType = rawKm <= 50 ? 'intrastate' : 'interstate';

  // ── Component calculations ────────────────────────────────────────────────
  const baseFee         = getBaseFee(baseFees, truckTypeId, truckType);
  const vehicleBandConfig = vehicleDistanceBands.find(v => v.truckTypeId.toString() === truckTypeId.toString());
  if (!vehicleBandConfig?.bands?.length) {
    throw new Error('Pricing bands are not configured for the selected vehicle type. Please contact support.');
  }
  const { billedKm, ratePerKm, cost: distanceCost } = calcDistanceCost(vehicleBandConfig.bands, rawKm);
  if (!ratePerKm) {
    throw new Error('No matching distance band found for the selected vehicle type and route distance.');
  }
  const routeFactor     = getRouteMultiplier(routeMultipliers, fromZone, toZone);
  const distanceFee     = Math.round(distanceCost * routeFactor);
  const deliveryModeFee = 0;

  // Subtotal before extras
  const subtotal = baseFee + distanceFee;

  // Extras
  const fragileFee  = 0;
  const fragileHandlingNote = isFragile
    ? 'Price will be determined upon inspection'
    : null;
  const insuranceFee= declaredValue > 0 ? Math.round(declaredValue * (optionalFees.insurancePercent || 1) / 100) : 0;
  const serviceFee  = 0;

  const rawTotal  = subtotal + insuranceFee;
  const totalAmount = Math.max(minimumCharge, Math.round(rawTotal / 100) * 100);

  // Delivery time estimate
  const estimatedDelivery =
    deliveryType === 'intrastate' ? '1–4 hours'
    : rawKm < 300                ? '1–2 business days'
    : rawKm < 600                ? '2–3 business days'
                                 : '3–5 business days';

  return {
    deliveryType,
    fromZone,
    toZone,
    originCity:       originState.name,
    destinationCity:  destState.name,
    estimatedDelivery,

    // Components (for UI breakdown)
    baseFee,
    distanceFee,
    deliveryModeFee,
    fragileFee,
    fragileHandlingNote,
    serviceFee,
    insuranceFee,
    totalAmount,

    // Metadata
    distanceKm:   rawKm,
    billedKm,
    ratePerKm,
    routeFactor,
    deliveryMode: 'door',
    isDynamic:    true,
    truckType: {
      _id:          truckType._id,
      name:         truckType.name,
      capacityTons: truckType.capacityTons,
      icon:         truckType.icon,
    },

    breakdown: {
      baseFee,
      distanceFee,
      distanceBand: findBand(vehicleBandConfig.bands, rawKm),
      deliveryModeFee,
      fragileFee,
      fragileHandlingNote,
      serviceFee,
      insuranceFee,
    },

    // Legacy fields kept for backward compatibility with existing order schema
    basePrice:        baseFee + distanceFee,
    serviceSurcharge: 0,
    // Kept for backward compatibility with existing order schema/history.
    weightSurcharge:  0,
    fragileSurcharge: 0,

    // Old direction fields — keep for admin displays
    fromDirection: fromZone,
    toDirection:   toZone,
  };
};

// ── Public config snapshot (for booking UI) ───────────────────────────────────
export const getPublicConfig = async () => {
  const config = await loadConfig();
  return {
    states:            config.states,
    truckTypes:        config.truckTypes,
    hasDynamicPricing: config.states.length > 0 && config.truckTypes.length > 0,
  };
};
