/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DYNAMIC PRICING SERVICE
 *
 *  Architecture:
 *  1. Loads Zone + TruckType + PricingRule config from MongoDB (cached 60s)
 *  2. If a matching rule exists for the route zone + truck type → dynamic price
 *  3. Falls back to the static pricing engine (utils/pricing.js) when:
 *     - No truck type selected
 *     - No DB config seeded
 *     - DB is unavailable
 *     - No rule for the zone+truckType pair
 *
 *  The returned object is shape-compatible with the static calcPrice output,
 *  adding: isDynamic (bool), truckType (null | {_id, name, capacityTons})
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Zone, TruckType, PricingRule } from '../db.js';
import { calcPrice as staticCalcPrice, ZONES as STATIC_ZONES } from '../utils/pricing.js';

// ── In-memory cache (60s TTL) ─────────────────────────────────────────────
let _cache     = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60_000;

export const invalidateCache = () => { _cache = null; _cacheTime = 0; };

async function loadConfig() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;

  const [zones, truckTypes, rules] = await Promise.all([
    Zone.find({ isActive: true }).sort({ zoneNumber: 1 }).lean(),
    TruckType.find({ isActive: true }).sort({ sortOrder: 1, capacityTons: 1 }).lean(),
    PricingRule.find({ isActive: true })
      .populate('fromZoneId',  'name states')
      .populate('toZoneId',    'name states')
      .populate('truckTypeId', 'name capacityTons icon')
      .lean(),
  ]);

  _cache     = { zones, truckTypes, rules };
  _cacheTime = Date.now();
  return _cache;
}

// ── Map city/state key → zone (DB first, no fallback for dynamic) ───────────
const getStateZone = (stateKey, dbZones) => {
  return dbZones.find(z => z.states?.includes(stateKey.toLowerCase()));
};

const SERVICE_SURCHARGES = { standard: 0, express: 2000, sameday: 3000 };

// ── Main exported calculator ──────────────────────────────────────────────
export const calcDynamicPrice = async ({
  originCity,
  destinationCity,
  weight,
  serviceType   = 'standard',
  isFragile     = false,
  declaredValue = 0,
  truckTypeId   = null,
}) => {
  // Base/fallback — always computed so we can fall through safely
  const staticResult = staticCalcPrice({
    originCity, destinationCity, weight, serviceType, isFragile, declaredValue,
  });

  // No truck type → weight-based static pricing
  if (!truckTypeId) {
    return { ...staticResult, isDynamic: false, truckType: null };
  }

  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    console.error('[PricingService] DB unavailable, using static:', err.message);
    return { ...staticResult, isDynamic: false, truckType: null };
  }

  const { zones, truckTypes, rules } = config;

  // Not enough DB config → fall back
  if (!zones.length || !truckTypes.length || !rules.length) {
    return { ...staticResult, isDynamic: false, truckType: null };
  }

  // Resolve the truck type object
  const truckType = truckTypes.find(tt => tt._id.toString() === truckTypeId.toString());
  if (!truckType) {
    return { ...staticResult, isDynamic: false, truckType: null };
  }

  const originZoneObj = getStateZone(originCity, zones);
  const destZoneObj   = getStateZone(destinationCity, zones);

  if (!originZoneObj || !destZoneObj) {
    return { ...staticResult, isDynamic: false, truckType };
  }

  const rule = rules.find(r =>
    r.fromZoneId?._id?.toString()  === originZoneObj._id.toString() &&
    r.toZoneId?._id?.toString()    === destZoneObj._id.toString() &&
    r.truckTypeId?._id?.toString() === truckType._id.toString()
  );

  if (!rule) {
    return { ...staticResult, isDynamic: false, truckType };
  }

  // ── Build dynamic price ──────────────────────────────────────────────────
  const basePrice        = rule.price;
  const serviceSurcharge = SERVICE_SURCHARGES[serviceType] || 0;
  const fragileSurcharge = isFragile ? 1000 : 0;
  const insuranceFee     = declaredValue > 0
    ? Math.max(Math.round(declaredValue * 0.015), 500)
    : 0;
  const totalAmount = basePrice + serviceSurcharge + fragileSurcharge + insuranceFee;

  const sameCityRoute = originCity.toLowerCase() === destinationCity.toLowerCase();
  const deliveryType  = sameCityRoute ? 'intrastate' : 'interstate';

  const deliveryDays = deliveryType === 'intrastate'
    ? (serviceType === 'sameday' ? 'Same day' : '1–2 hours')
    : serviceType === 'express'
      ? '24–48 hours'
      : `3–5 business days`;

  return {
    deliveryType,
    originCity:        STATIC_ZONES[originCity]?.name    || originCity,
    destinationCity:   STATIC_ZONES[destinationCity]?.name || destinationCity,
    serviceType,
    estimatedDelivery: deliveryDays,
    basePrice,
    weightSurcharge:   0,      // truck type replaces weight-based surcharge
    serviceSurcharge,
    fragileSurcharge,
    insuranceFee,
    totalAmount,
    isDynamic:   true,
    truckType:   { _id: truckType._id, name: truckType.name, capacityTons: truckType.capacityTons, icon: truckType.icon },
    breakdown: {
      baseRate:         basePrice,
      weightSurcharge:  0,
      serviceSurcharge,
      fragileSurcharge,
      insuranceFee,
    },
  };
};

// ── Public config snapshot (for booking UI) ───────────────────────────────
export const getPublicConfig = async () => {
  const config = await loadConfig();
  return {
    zones:             config.zones,
    truckTypes:        config.truckTypes,
    hasDynamicPricing: config.zones.length > 0 && config.truckTypes.length > 0 && config.rules.length > 0,
  };
};
