/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DYNAMIC PRICING SERVICE (Direction-Based Matrix)
 *
 *  Architecture:
 *  1. Loads State + TruckType + Pricing config from MongoDB (cached)
 *  2. Map pickup and delivery states to their directions
 *  3. Lookup the exact pricing rule in the Matrix
 *  4. Return the flat price
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { State, TruckType, Pricing } from '../db.js';

// ── In-memory cache (60s TTL) ─────────────────────────────────────────────
let _cache     = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60_000;

export const invalidateCache = () => { _cache = null; _cacheTime = 0; };

async function loadConfig() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;

  const [states, truckTypes, rules] = await Promise.all([
    State.find().lean(),
    TruckType.find({ isActive: true }).sort({ sortOrder: 1, capacityTons: 1 }).lean(),
    Pricing.find({ isActive: true }).populate('truckTypeId', 'name capacityTons icon').lean(),
  ]);

  _cache     = { states, truckTypes, rules };
  _cacheTime = Date.now();
  return _cache;
}

// ── Main exported calculator ──────────────────────────────────────────────
export const calcDynamicPrice = async ({
  originCity,
  destinationCity,
  truckTypeId,
  weight = 0,
  serviceType = 'standard',
  isFragile = false,
  declaredValue = 0,
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

  const { states, truckTypes, rules } = config;

  // Resolve the truck type object
  const truckType = truckTypes.find(tt => tt._id.toString() === truckTypeId.toString());
  if (!truckType) {
    throw new Error('Selected vehicle type is invalid or inactive');
  }

  // Find State objects to resolve direction
  const originState = states.find(s => s.name === originCity || s.name.toLowerCase() === originCity.toLowerCase() || s.name.toLowerCase().includes(originCity.toLowerCase()));
  const destState   = states.find(s => s.name === destinationCity || s.name.toLowerCase() === destinationCity.toLowerCase() || s.name.toLowerCase().includes(destinationCity.toLowerCase()));

  if (!originState) throw new Error(`Invalid pickup location: ${originCity}`);
  if (!destState) throw new Error(`Invalid destination location: ${destinationCity}`);

  if (!originState.isActive || !destState.isActive) {
    throw new Error('Service unavailable in selected state');
  }

  const fromDirection = originState.direction;
  const toDirection = destState.direction;

  const rule = rules.find(r =>
    r.fromDirection === fromDirection &&
    r.toDirection === toDirection &&
    (r.truckTypeId?._id?.toString() === truckType._id.toString() || r.truckTypeId?.toString() === truckType._id.toString())
  );

  if (!rule) {
    throw new Error(`Pricing not configured for ${fromDirection} to ${toDirection} using ${truckType.name}`);
  }

  const basePrice = rule.price;
  const sameCityRoute = originCity.toLowerCase() === destinationCity.toLowerCase();
  const deliveryType  = sameCityRoute ? 'intrastate' : 'interstate';

  // ── Surcharge Logic ───────────────────────────────────────────────────────
  const serviceSurcharge = 
    serviceType === 'express' ? 2000 : 
    serviceType === 'sameday' ? 3000 : 0;

  // Weight surcharge: e.g. 200 per kg above 50kg for standard vehicle
  // or use truck capacity as a factor. For now, simple weight logic:
  const weightSurcharge = Math.max(0, (weight - 50)) * 100; 

  const fragileSurcharge = isFragile ? Math.round(basePrice * 0.1) : 0;
  const insuranceFee     = declaredValue > 0 ? Math.round(declaredValue * 0.01) : 0;

  const totalAmount = basePrice + serviceSurcharge + weightSurcharge + fragileSurcharge + insuranceFee;

  // Delivery days estimate simplified
  const deliveryDays = deliveryType === 'intrastate' ? '1–2 hours' : '3–5 days';

  return {
    deliveryType,
    fromDirection,
    toDirection,
    originCity: originState.name,
    destinationCity: destState.name,
    estimatedDelivery: deliveryDays,
    basePrice,
    serviceSurcharge,
    weightSurcharge,
    fragileSurcharge,
    insuranceFee,
    totalAmount,
    isDynamic: true,
    truckType: { _id: truckType._id, name: truckType.name, capacityTons: truckType.capacityTons, icon: truckType.icon },
    breakdown: {
      baseRate: basePrice,
      serviceAddon: serviceSurcharge,
      weightAddon: weightSurcharge,
      fragileAddon: fragileSurcharge,
      insuranceAddon: insuranceFee,
    },
  };
};

// ── Public config snapshot (for booking UI) ───────────────────────────────
export const getPublicConfig = async () => {
  const config = await loadConfig();
  return {
    states:            config.states,
    truckTypes:        config.truckTypes,
    hasDynamicPricing: config.states.length > 0 && config.truckTypes.length > 0 && config.rules.length > 0,
  };
};
