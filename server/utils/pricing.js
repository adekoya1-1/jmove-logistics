/**
 * JMove Logistics Pricing Engine
 * Modelled on GIG Logistics zone-based + weight-based pricing
 * ─────────────────────────────────────────────────────────────
 * Service Types:
 *   intrastate  – same city (e.g. Lagos to Lagos)
 *   interstate  – different cities within Nigeria
 *   express     – GoFaster equivalent: 24–48hr guaranteed
 *
 * Pricing: base rate per zone × weight tier multiplier
 */

// Nigerian delivery zones (simplified)
// Zone determines base rate for interstate
export const ZONES = {
  abia: { name: 'Abia', zone: 3 }, adamawa: { name: 'Adamawa', zone: 4 }, akwa_ibom: { name: 'Akwa Ibom', zone: 3 },
  anambra: { name: 'Anambra', zone: 3 }, bauchi: { name: 'Bauchi', zone: 4 }, bayelsa: { name: 'Bayelsa', zone: 3 },
  benue: { name: 'Benue', zone: 3 }, borno: { name: 'Borno', zone: 4 }, cross_river: { name: 'Cross River', zone: 3 },
  delta: { name: 'Delta', zone: 3 }, ebonyi: { name: 'Ebonyi', zone: 3 }, edo: { name: 'Edo', zone: 3 },
  ekiti: { name: 'Ekiti', zone: 2 }, enugu: { name: 'Enugu', zone: 3 }, gombe: { name: 'Gombe', zone: 4 },
  imo: { name: 'Imo', zone: 3 }, jigawa: { name: 'Jigawa', zone: 4 }, kaduna: { name: 'Kaduna', zone: 4 },
  kano: { name: 'Kano', zone: 4 }, katsina: { name: 'Katsina', zone: 4 }, kebbi: { name: 'Kebbi', zone: 4 },
  kogi: { name: 'Kogi', zone: 3 }, kwara: { name: 'Kwara', zone: 3 }, lagos: { name: 'Lagos', zone: 1 },
  nasarawa: { name: 'Nasarawa', zone: 3 }, niger: { name: 'Niger', zone: 3 }, ogun: { name: 'Ogun', zone: 1 },
  ondo: { name: 'Ondo', zone: 2 }, osun: { name: 'Osun', zone: 2 }, oyo: { name: 'Oyo', zone: 2 },
  plateau: { name: 'Plateau', zone: 3 }, rivers: { name: 'Rivers', zone: 3 }, sokoto: { name: 'Sokoto', zone: 4 },
  taraba: { name: 'Taraba', zone: 4 }, yobe: { name: 'Yobe', zone: 4 }, zamfara: { name: 'Zamfara', zone: 4 },
  fct: { name: 'FCT (Abuja)', zone: 3 },
};

// Intrastate base prices (₦) — same city delivery
const INTRASTATE = {
  base:    1500,   // base fee regardless of weight
  perKg:   200,    // additional per kg above 1kg
  express: 2500,   // express same-day base
  min:     1500,
};

// Interstate base prices per zone pair (₦)
// Key: Math.max(fromZone, toZone) to get the rate
const INTERSTATE_ZONE_RATES = {
  1: 2500,   // Zone 1 to Zone 1 (e.g. Lagos to Abeokuta)
  2: 3500,   // involving Zone 2
  3: 5000,   // involving Zone 3
  4: 7500,   // involving Zone 4 (far north/remote)
};

// Weight surcharges for ALL service types (₦ added on top of base)
const WEIGHT_TIERS = [
  { maxKg: 1,        surcharge: 0    },
  { maxKg: 3,        surcharge: 500  },
  { maxKg: 5,        surcharge: 1000 },
  { maxKg: 10,       surcharge: 2000 },
  { maxKg: 20,       surcharge: 3500 },
  { maxKg: 50,       surcharge: 6000 },
  { maxKg: Infinity, surcharge: 10000},
];

// Service type surcharges
const SERVICE_SURCHARGES = {
  standard: 0,
  express:  2000,  // GoFaster equivalent
  sameday:  3000,  // Same-day delivery
};

const getWeightSurcharge = (kg) => {
  for (const tier of WEIGHT_TIERS) if (+kg <= tier.maxKg) return tier.surcharge;
  return WEIGHT_TIERS.at(-1).surcharge;
};

/**
 * Determine if two city keys are the same city
 */
const isSameCity = (originKey, destinationKey) => {
  return originKey === destinationKey;
};

/**
 * Main price calculator
 */
export const calcPrice = ({
  originCity,
  destinationCity,
  weight,
  serviceType = 'standard',
  isFragile = false,
  declaredValue = 0,
}) => {
  const kg = +weight || 0;
  const originZone = ZONES[originCity]?.zone || 4;
  const destZone   = ZONES[destinationCity]?.zone || 4;
  const sameCity   = isSameCity(originCity, destinationCity);
  const deliveryType = sameCity ? 'intrastate' : 'interstate';

  let basePrice = 0;

  if (deliveryType === 'intrastate') {
    basePrice = serviceType === 'sameday'
      ? INTRASTATE.express
      : INTRASTATE.base;
    // Per kg above 1kg for intrastate
    if (kg > 1) basePrice += Math.ceil(kg - 1) * INTRASTATE.perKg;
  } else {
    const maxZone = Math.max(originZone, destZone);
    basePrice = INTERSTATE_ZONE_RATES[maxZone] || INTERSTATE_ZONE_RATES[4];
  }

  const weightSurcharge   = deliveryType === 'interstate' ? getWeightSurcharge(kg) : 0;
  const serviceSurcharge  = SERVICE_SURCHARGES[serviceType] || 0;
  const fragileSurcharge  = isFragile ? 1000 : 0;

  // Insurance: 1.5% of declared value (min ₦500) if declared value provided
  const insuranceFee = declaredValue > 0
    ? Math.max(Math.round(declaredValue * 0.015), 500)
    : 0;

  const subtotal    = basePrice + weightSurcharge + serviceSurcharge + fragileSurcharge + insuranceFee;
  const totalAmount = Math.max(subtotal, INTRASTATE.min);

  // Estimated delivery time
  const deliveryDays = deliveryType === 'intrastate'
    ? serviceType === 'sameday' ? 'Same day' : '1–2 hours'
    : serviceType === 'express'
      ? '24–48 hours'
      : `${Math.max(originZone, destZone)}–${Math.max(originZone, destZone) + 1} business days`;

  return {
    deliveryType,
    originCity:       ZONES[originCity]?.name || originCity,
    destinationCity:  ZONES[destinationCity]?.name || destinationCity,
    serviceType,
    estimatedDelivery: deliveryDays,
    basePrice,
    weightSurcharge,
    serviceSurcharge,
    fragileSurcharge,
    insuranceFee,
    totalAmount,
    breakdown: {
      baseRate:        basePrice,
      weightSurcharge,
      serviceSurcharge,
      fragileSurcharge,
      insuranceFee,
    },
  };
};

export const getCityList = () =>
  Object.entries(ZONES).map(([key, val]) => ({ key, ...val }));
