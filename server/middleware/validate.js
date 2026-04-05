/**
 * ─────────────────────────────────────────────────────────
 *  CENTRAL ZOD VALIDATION MIDDLEWARE
 *  Usage: router.post('/route', validate(schemas.createOrder), handler)
 *
 *  - Strips unknown fields (no mass-assignment)
 *  - Enforces types, lengths, formats
 *  - Returns structured errors
 * ─────────────────────────────────────────────────────────
 */
import { z } from 'zod';
import mongoose from 'mongoose';

// ── Helper validators ────────────────────────────────────
const objectId = z.string().refine(
  v => mongoose.Types.ObjectId.isValid(v),
  { message: 'Invalid ID format' }
);

const phone = z.string()
  .min(7, 'Phone number too short')
  .max(20, 'Phone number too long')
  .regex(/^[\+\d\s\-\(\)]+$/, 'Invalid phone number format');

const cityKey = z.string()
  .min(2).max(30)
  .regex(/^[a-z]+$/, 'City must be lowercase letters only');

const nigerianAmount = z.number().min(0).max(100_000_000);

// ── Core validation middleware factory ──────────────────
export const validate = (schema, source = 'body') => (req, res, next) => {
  const data = source === 'body'   ? req.body
              : source === 'query' ? req.query
              : source === 'params' ? req.params
              : req.body;

  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map(i => ({
      field:   i.path.join('.'),
      message: i.message,
    }));
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }
  // Replace the source with the stripped/coerced data (kills unknown fields)
  if (source === 'body')   req.body   = result.data;
  if (source === 'query')  req.query  = result.data;
  if (source === 'params') req.params = result.data;
  next();
};

// ── Multi-source validator (body + params + query) ──────
export const validateAll = ({ body: bodySchema, params: paramsSchema, query: querySchema }) =>
  (req, res, next) => {
    const errors = [];
    if (bodySchema) {
      const r = bodySchema.safeParse(req.body);
      if (!r.success) errors.push(...r.error.issues.map(i => ({ field: `body.${i.path.join('.')}`, message: i.message })));
      else req.body = r.data;
    }
    if (paramsSchema) {
      const r = paramsSchema.safeParse(req.params);
      if (!r.success) errors.push(...r.error.issues.map(i => ({ field: `params.${i.path.join('.')}`, message: i.message })));
      else req.params = r.data;
    }
    if (querySchema) {
      const r = querySchema.safeParse(req.query);
      if (!r.success) errors.push(...r.error.issues.map(i => ({ field: `query.${i.path.join('.')}`, message: i.message })));
      else req.query = r.data;
    }
    if (errors.length) return res.status(400).json({ success: false, message: 'Validation failed', errors });
    next();
  };

// ═══════════════════════════════════════════════════════
//  SCHEMAS
// ═══════════════════════════════════════════════════════

// ── Auth ────────────────────────────────────────────────
export const authSchemas = {
  register: z.object({
    email:        z.string().email().max(254).toLowerCase().trim(),
    password:     z.string()
                    .min(8,  'Password must be at least 8 characters')
                    .max(72, 'Password too long')
                    .regex(/[A-Z]/,   'Password must contain an uppercase letter')
                    .regex(/[0-9]/,   'Password must contain a number')
                    .regex(/[^A-Za-z0-9]/, 'Password must contain a special character'),
    firstName:    z.string().min(1).max(50).trim(),
    lastName:     z.string().min(1).max(50).trim(),
    phone:        phone.optional(),
  }),

  login: z.object({
    email:    z.string().email().max(254).toLowerCase().trim(),
    password: z.string().min(1).max(128),
  }),

  changePassword: z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string()
      .min(8).max(72)
      .regex(/[A-Z]/, 'Must contain uppercase')
      .regex(/[0-9]/, 'Must contain number')
      .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  }),

  updateProfile: z.object({
    firstName: z.string().min(1).max(50).trim().optional(),
    lastName:  z.string().min(1).max(50).trim().optional(),
    phone:     phone.optional(),
  }),
};

// ── Orders ──────────────────────────────────────────────
export const orderSchemas = {
  create: z.object({
    senderName:       z.string().min(1).max(100).trim(),
    senderPhone:      phone,
    senderEmail:      z.string().email().max(254).optional().or(z.literal('')),
    senderAddress:    z.string().max(300).trim().optional(),
    originCity:       cityKey,

    receiverName:     z.string().min(1).max(100).trim(),
    receiverPhone:    phone,
    receiverEmail:    z.string().email().max(254).optional().or(z.literal('')),
    receiverAddress:  z.string().min(1).max(300).trim(),
    destinationCity:  cityKey,

    description:      z.string().min(1).max(200).trim(),
    weight:           z.coerce.number().min(0.1).max(5000),
    quantity:         z.coerce.number().int().min(1).max(1000).optional().default(1),
    category:         z.string().max(50).optional().default('general'),
    isFragile:        z.coerce.boolean().optional().default(false),
    declaredValue:    z.coerce.number().min(0).max(100_000_000).optional().default(0),
    specialInstructions: z.string().max(500).trim().optional(),

    serviceType:      z.enum(['standard', 'express', 'sameday']).optional().default('standard'),
    paymentMethod:    z.enum(['online', 'cash', 'cod', 'wallet']).optional().default('online'),
    codAmount:        z.coerce.number().min(0).max(100_000_000).optional().default(0),

    pickupLat:        z.coerce.number().min(-90).max(90).optional(),
    pickupLng:        z.coerce.number().min(-180).max(180).optional(),
    deliveryLat:      z.coerce.number().min(-90).max(90).optional(),
    deliveryLng:      z.coerce.number().min(-180).max(180).optional(),

    staffNotes:       z.string().max(500).trim().optional(),
    truckTypeId:  objectId.optional(),
  }),

  calcPrice: z.object({
    originCity:      cityKey,
    destinationCity: cityKey,
    weight:          z.coerce.number().min(0.1).max(5000),
    serviceType:     z.enum(['standard', 'express', 'sameday']).optional(),
    isFragile:       z.coerce.boolean().optional(),
    declaredValue:   z.coerce.number().min(0).optional(),
    truckTypeId:     objectId.optional(),
  }),

  addNote: z.object({
    note:     z.string().min(1).max(500).trim(),
    location: z.string().max(200).trim().optional(),
  }),

  idParam: z.object({
    id: objectId,
  }),

  statusUpdate: z.object({
    status:   z.enum(['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'cancelled']),
    note:     z.string().max(500).trim().optional(),
    location: z.string().max(200).trim().optional(),
  }),

  assign: z.object({
    driverId: objectId,
  }),

  listQuery: z.object({
    status:       z.enum(['booked','assigned','picked_up','in_transit','out_for_delivery','delivered','returned','cancelled']).optional(),
    deliveryType: z.enum(['intrastate','interstate']).optional(),
    serviceType:  z.enum(['standard','express','sameday']).optional(),
    page:         z.coerce.number().int().min(1).max(1000).optional().default(1),
    limit:        z.coerce.number().int().min(1).max(100).optional().default(15),
    search:       z.string().max(100).trim().optional(),
  }),
};

// ── Payments ────────────────────────────────────────────
export const paymentSchemas = {
  initialize: z.object({
    orderId: objectId,
  }),

  verify: z.object({
    reference: z.string().min(1).max(100).regex(/^[A-Za-z0-9\-_]+$/, 'Invalid reference format'),
  }),

  statsQuery: z.object({
    period: z.enum(['7d', '30d', '90d', '1y']).optional().default('30d'),
  }),
};

// ── Drivers ─────────────────────────────────────────────
export const driverSchemas = {
  create: z.object({
    firstName:    z.string().min(1).max(50).trim(),
    lastName:     z.string().min(1).max(50).trim(),
    email:        z.string().email().max(254).toLowerCase().trim(),
    phone:        phone.optional(),
    password:     z.string().min(8).max(72).regex(/[A-Z]/).regex(/[0-9]/),
    vehicleType:  z.enum(['bike', 'car', 'van', 'truck']),
    vehiclePlate: z.string().min(2).max(20).trim().toUpperCase(),
    vehicleModel: z.string().max(60).trim().optional(),
    licenseNumber:z.string().max(30).trim().optional(),
    employeeId:   z.string().max(20).trim().optional(),
  }),

  statusUpdate: z.object({
    status: z.enum(['available', 'busy', 'offline']),
  }),

  location: z.object({
    lat:     z.coerce.number().min(-90).max(90),
    lng:     z.coerce.number().min(-180).max(180),
    orderId: objectId.optional(),
  }),

  listQuery: z.object({
    status: z.enum(['available','busy','offline']).optional(),
    page:   z.coerce.number().int().min(1).max(1000).optional().default(1),
    limit:  z.coerce.number().int().min(1).max(50).optional().default(20),
  }),

  idParam: z.object({ id: objectId }),

  orderIdParam: z.object({ orderId: objectId }),
};

// ── Staff ───────────────────────────────────────────────
const VALID_PERMISSIONS = ['orders','drivers','payments','analytics','map','staff'];
const VALID_CATEGORIES  = ['super_admin','operations','dispatch','finance','support','supervisor'];

export const staffSchemas = {
  create: z.object({
    firstName:     z.string().min(1).max(50).trim(),
    lastName:      z.string().min(1).max(50).trim(),
    email:         z.string().email().max(254).toLowerCase().trim(),
    phone:         phone.optional(),
    password:      z.string().min(8).max(72).regex(/[A-Z]/).regex(/[0-9]/),
    staffCategory: z.enum(VALID_CATEGORIES),
    permissions:   z.array(z.enum(VALID_PERMISSIONS)).max(6).optional().default([]),
  }),

  updatePermissions: z.object({
    permissions:   z.array(z.enum(VALID_PERMISSIONS)).max(6).optional(),
    staffCategory: z.enum(VALID_CATEGORIES).optional(),
  }),

  staffQuery: z.object({
    search: z.string().max(100).trim().optional(),
    page:   z.coerce.number().int().min(1).optional().default(1),
    limit:  z.coerce.number().int().min(1).max(50).optional().default(20),
  }),

  idParam: z.object({ id: objectId }),
};

// ── Reviews ─────────────────────────────────────────────
export const reviewSchemas = {
  submit: z.object({
    orderId: objectId,
    rating:  z.coerce.number().int().min(1).max(5),
    comment: z.string().max(500).trim().optional().default(''),
  }),

  orderIdParam: z.object({ orderId: objectId }),
  driverIdParam:z.object({ driverId: objectId }),
};

// ── OTP ─────────────────────────────────────────────────
const otpCode = z.string()
  .length(6, 'Verification code must be exactly 6 digits')
  .regex(/^\d{6}$/, 'Verification code must contain only digits');

export const otpSchemas = {
  // Resend email-verification OTP (for registered but unverified accounts)
  resendOtp: z.object({
    email: z.string().email('Invalid email address').max(254).toLowerCase().trim(),
  }),

  // Verify email-verification OTP → issues access/refresh tokens
  verifyOtp: z.object({
    email: z.string().email('Invalid email address').max(254).toLowerCase().trim(),
    otp:   otpCode,
  }),

  // Request password-reset OTP (always 200 — anti-enumeration)
  forgotPassword: z.object({
    email: z.string().email('Invalid email address').max(254).toLowerCase().trim(),
  }),

  // Verify password-reset OTP → returns short-lived resetToken JWT
  verifyResetOtp: z.object({
    email: z.string().email('Invalid email address').max(254).toLowerCase().trim(),
    otp:   otpCode,
  }),

  // Use resetToken JWT + new password to complete the reset
  resetPassword: z.object({
    resetToken:  z.string().min(1).max(600),
    newPassword: z.string()
      .min(8,   'Password must be at least 8 characters')
      .max(72,  'Password too long')
      .regex(/[A-Z]/,        'Password must contain an uppercase letter')
      .regex(/[0-9]/,        'Password must contain a number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain a special character'),
  }),
};

// ── Pricing ─────────────────────────────────────────────
export const pricingSchemas = {
  createZone: z.object({
    name:        z.string().min(1).max(100).trim(),
    description: z.string().max(200).trim().optional().default(''),
    zoneNumber:  z.coerce.number().int().min(0).max(10),
    cities:      z.array(z.string().toLowerCase().trim()).optional().default([]),
    sortOrder:   z.coerce.number().int().min(0).optional().default(0),
  }),

  updateZone: z.object({
    name:        z.string().min(1).max(100).trim().optional(),
    description: z.string().max(200).trim().optional(),
    zoneNumber:  z.coerce.number().int().min(0).max(10).optional(),
    cities:      z.array(z.string().toLowerCase().trim()).optional(),
    isActive:    z.boolean().optional(),
    sortOrder:   z.coerce.number().int().min(0).optional(),
  }),

  createTruckType: z.object({
    name:         z.string().min(1).max(100).trim(),
    description:  z.string().max(200).trim().optional().default(''),
    capacityTons: z.coerce.number().min(0).max(1000),
    icon:         z.string().max(10).optional().default('🚛'),
    sortOrder:    z.coerce.number().int().min(0).optional().default(0),
  }),

  updateTruckType: z.object({
    name:         z.string().min(1).max(100).trim().optional(),
    description:  z.string().max(200).trim().optional(),
    capacityTons: z.coerce.number().min(0).max(1000).optional(),
    icon:         z.string().max(10).optional(),
    isActive:     z.boolean().optional(),
    sortOrder:    z.coerce.number().int().min(0).optional(),
  }),

  upsertRule: z.object({
    zoneId:      z.string().refine(v => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid zone ID' }),
    truckTypeId: z.string().refine(v => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid truck type ID' }),
    basePrice:   z.coerce.number().min(0).max(100_000_000),
    pricePerKm:  z.coerce.number().min(0).max(100_000).optional().default(0),
  }),

  updateRule: z.object({
    basePrice:   z.coerce.number().min(0).max(100_000_000).optional(),
    pricePerKm:  z.coerce.number().min(0).max(100_000).optional(),
    isActive:    z.boolean().optional(),
  }),

  idParam: z.object({
    id: z.string().refine(v => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid ID format' }),
  }),
};

export { objectId };
