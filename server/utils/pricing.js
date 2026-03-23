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
  lagos:       { name: 'Lagos',        zone: 1 },
  abuja:       { name: 'Abuja (FCT)',  zone: 2 },
  portharcourt:{ name: 'Port Harcourt',zone: 2 },
  ibadan:      { name: 'Ibadan',       zone: 2 },
  kano:        { name: 'Kano',         zone: 3 },
  enugu:       { name: 'Enugu',        zone: 2 },
  benin:       { name: 'Benin City',   zone: 2 },
  owerri:      { name: 'Owerri',       zone: 2 },
  onitsha:     { name: 'Onitsha',      zone: 2 },
  asaba:       { name: 'Asaba',        zone: 2 },
  warri:       { name: 'Warri',        zone: 3 },
  kaduna:      { name: 'Kaduna',       zone: 3 },
  jos:         { name: 'Jos',          zone: 3 },
  ilorin:      { name: 'Ilorin',       zone: 2 },
  uyo:         { name: 'Uyo',          zone: 3 },
  calabar:     { name: 'Calabar',      zone: 3 },
  maiduguri:   { name: 'Maiduguri',    zone: 4 },
  sokoto:      { name: 'Sokoto',       zone: 4 },
  yola:        { name: 'Yola',         zone: 4 },
  akure:       { name: 'Akure',        zone: 2 },
  abeokuta:    { name: 'Abeokuta',     zone: 1 },
  lekki:       { name: 'Lekki',        zone: 1 },
  others:      { name: 'Other',        zone: 4 },
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
  // Group related city keys
  const lagosGroup = ['lagos','lekki','abeokuta'];
  const inLagos = (k) => lagosGroup.includes(k);
  if (inLagos(originKey) && inLagos(destinationKey)) return true;
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
