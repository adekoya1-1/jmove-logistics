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
      .populate('zoneId',      'zoneNumber name cities')
      .populate('truckTypeId', 'name capacityTons icon')
      .lean(),
  ]);

  _cache     = { zones, truckTypes, rules };
  _cacheTime = Date.now();
  return _cache;
}

// ── Rough estimated km between zones (used only when pricePerKm > 0) ──────
const ZONE_PAIR_KM = {
  '0-0': 15, '1-1': 80, '1-2': 200, '2-2': 250,
  '1-3': 400, '2-3': 350, '3-3': 450,
  '1-4': 700, '2-4': 650, '3-4': 550, '4-4': 800,
};
const estimateKm = (a, b) => {
  const key = [Math.min(a, b), Math.max(a, b)].join('-');
  return ZONE_PAIR_KM[key] || 500;
};

// ── Same-city detection (kept in sync with static pricing.js) ─────────────
const LAGOS_GROUP = ['lagos', 'lekki', 'abeokuta'];
const isSameCity = (a, b) => {
  if (LAGOS_GROUP.includes(a) && LAGOS_GROUP.includes(b)) return true;
  return a === b;
};

// ── Map city key → zone number (DB first, then static fallback) ───────────
const getCityZoneNum = (cityKey, dbZones) => {
  const hit = dbZones.find(z => z.cities?.includes(cityKey.toLowerCase()));
  if (hit) return hit.zoneNumber;
  return STATIC_ZONES[cityKey]?.zone ?? 4;
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

  // Determine route zone number
  const sameCityRoute = isSameCity(originCity, destinationCity);
  const deliveryType  = sameCityRoute ? 'intrastate' : 'interstate';

  const routeZoneNum = sameCityRoute
    ? 0
    : Math.max(getCityZoneNum(originCity, zones), getCityZoneNum(destinationCity, zones));

  // Find a Zone document with the computed zoneNumber
  const matchedZone = zones.find(z => z.zoneNumber === routeZoneNum);
  if (!matchedZone) {
    return { ...staticResult, isDynamic: false, truckType };
  }

  // Find a pricing rule for (zone, truckType)
  const rule = rules.find(r =>
    r.zoneId?._id?.toString()      === matchedZone._id.toString() &&
    r.truckTypeId?._id?.toString() === truckType._id.toString()
  );
  if (!rule) {
    return { ...staticResult, isDynamic: false, truckType };
  }

  // ── Build dynamic price ──────────────────────────────────────────────────
  const originZoneNum = getCityZoneNum(originCity, zones);
  const destZoneNum   = getCityZoneNum(destinationCity, zones);
  const estKm         = sameCityRoute ? 15 : estimateKm(originZoneNum, destZoneNum);

  const basePrice        = Math.round(rule.basePrice + (rule.pricePerKm || 0) * estKm);
  const serviceSurcharge = SERVICE_SURCHARGES[serviceType] || 0;
  const fragileSurcharge = isFragile ? 1000 : 0;
  const insuranceFee     = declaredValue > 0
    ? Math.max(Math.round(declaredValue * 0.015), 500)
    : 0;
  const totalAmount = basePrice + serviceSurcharge + fragileSurcharge + insuranceFee;

  const deliveryDays = deliveryType === 'intrastate'
    ? (serviceType === 'sameday' ? 'Same day' : '1–2 hours')
    : serviceType === 'express'
      ? '24–48 hours'
      : `${routeZoneNum}–${routeZoneNum + 1} business days`;

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
      estimatedKm:      estKm,
      pricePerKm:       rule.pricePerKm || 0,
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
