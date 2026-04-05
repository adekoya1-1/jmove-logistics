import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// User schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  firstName: { type: String, required: true, trim: true },
  lastName:  { type: String, required: true, trim: true },
  phone:     { type: String },
  role:      { type: String, enum: ['admin', 'customer', 'driver'], default: 'customer' },
  isActive:  { type: Boolean, default: true },
  emailVerified: { type: Boolean, default: false },
  lastLogin: { type: Date },
  refreshToken: { type: String },   // stored as bcrypt hash

  // ── Brute-force lockout ─────────────────────────────────
  loginAttempts: { type: Number, default: 0 },
  lockUntil:     { type: Date, default: null },

  // ── Token invalidation version ──────────────────────────
  // Increment on password change to invalidate all existing JWTs
  tokenVersion:  { type: Number, default: 0 },

  // Staff / admin fields
  staffCategory: {
    type: String,
    enum: ['super_admin', 'operations', 'dispatch', 'finance', 'support', 'supervisor'],
    default: null,
  },
  permissions: [{
    type: String,
    enum: ['orders', 'drivers', 'payments', 'analytics', 'map', 'staff'],
  }],
}, { timestamps: true });

// Driver profile schema
const driverProfileSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  vehicleType:  { type: String, enum: ['bike', 'car', 'van', 'truck'], required: true },
  vehiclePlate: { type: String, required: true },
  vehicleModel: { type: String },
  licenseNumber:{ type: String },
  employeeId:   { type: String },
  status:       { type: String, enum: ['available', 'busy', 'offline'], default: 'offline' },
  currentLat:   { type: Number },
  currentLng:   { type: Number },
  locationUpdatedAt: { type: Date },
  totalDeliveries:   { type: Number, default: 0 },
  rating:       { type: Number, default: 5.0, min: 1, max: 5 },
  isVerified:   { type: Boolean, default: false },
}, { timestamps: true });

// Order schema — GIG Logistics style
const orderSchema = new mongoose.Schema({
  waybillNumber:{ type: String, unique: true, required: true },  // e.g. JMV-LAG-20240318-001
  customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null for walk-in
  driverId:     { type: mongoose.Schema.Types.ObjectId, ref: 'DriverProfile' },
  createdByStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin/staff who created

  // Sender details
  senderName:   { type: String, required: true },
  senderPhone:  { type: String, required: true },
  senderEmail:  { type: String },
  senderAddress:{ type: String },
  originCity:   { type: String, required: true },

  // Receiver details
  receiverName:   { type: String, required: true },
  receiverPhone:  { type: String, required: true },
  receiverEmail:  { type: String },
  receiverAddress:{ type: String, required: true },
  destinationCity:{ type: String, required: true },

  // Package details
  description:      { type: String, required: true },
  weight:           { type: Number, required: true },
  quantity:         { type: Number, default: 1 },
  category:         { type: String, default: 'general' },
  isFragile:        { type: Boolean, default: false },
  declaredValue:    { type: Number, default: 0 },   // for insurance
  specialInstructions: { type: String },

  // Service
  serviceType:      { type: String, enum: ['standard','express','sameday'], default: 'standard' },
  deliveryType:     { type: String, enum: ['intrastate','interstate'], required: true },
  estimatedDelivery:{ type: String },  // "1-2 hours", "2-3 business days"

  // Payment
  basePrice:        { type: Number, required: true },
  weightSurcharge:  { type: Number, default: 0 },
  serviceSurcharge: { type: Number, default: 0 },
  fragileSurcharge: { type: Number, default: 0 },
  insuranceFee:     { type: Number, default: 0 },
  totalAmount:      { type: Number, required: true },
  paymentMethod:    { type: String, enum: ['online','cash','cod','wallet'], default: 'online' },
  paymentStatus:    { type: String, enum: ['pending','paid','failed','refunded'], default: 'pending' },
  paystackReference:{ type: String },
  codAmount:        { type: Number, default: 0 },   // Cash on Delivery amount

  // Status
  status: {
    type: String,
    enum: ['booked','assigned','picked_up','in_transit','out_for_delivery','delivered','returned','cancelled'],
    default: 'booked',
  },

  assignedAt:   { type: Date },
  pickedUpAt:   { type: Date },
  deliveredAt:  { type: Date },

  // GPS (optional — for pickup/delivery tracking)
  pickupLat:    { type: Number },
  pickupLng:    { type: Number },
  deliveryLat:  { type: Number },
  deliveryLng:  { type: Number },

  statusHistory: [{
    fromStatus: String,
    toStatus:   { type: String, required: true },
    changedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note:       String,
    location:   String,
    changedAt:  { type: Date, default: Date.now },
  }],

  // Internal notes
  staffNotes: { type: String },

  // Truck type selected for this shipment (optional — set when dynamic pricing used)
  truckTypeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'TruckType', default: null },
  truckTypeName: { type: String, trim: true, default: null },
}, { timestamps: true });

// Payment schema
const paymentSchema = new mongoose.Schema({
  orderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount:     { type: Number, required: true },
  currency:   { type: String, default: 'NGN' },
  paystackReference:   { type: String, unique: true, sparse: true },
  paystackTransactionId: { type: String },
  status:     { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  paidAt:     { type: Date },
  metadata:   { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

// Tracking event schema
const trackingEventSchema = new mongoose.Schema({
  orderId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'DriverProfile' },
  lat:      { type: Number, required: true },
  lng:      { type: Number, required: true },
  eventType:{ type: String, default: 'location_update' },
  message:  { type: String },
}, { timestamps: true });

// Notification schema
const notificationSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:     { type: String, required: true },
  message:   { type: String, required: true },
  type:      { type: String, default: 'info' },
  isRead:    { type: Boolean, default: false },
  relatedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
}, { timestamps: true });

// Review / Rating schema  (customer rates a delivered order)
const reviewSchema = new mongoose.Schema({
  orderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Order',         required: true, unique: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User',          required: true },
  driverId:   { type: mongoose.Schema.Types.ObjectId, ref: 'DriverProfile', required: true },
  rating:     { type: Number, required: true, min: 1, max: 5 },
  comment:    { type: String, maxlength: 500 },
}, { timestamps: true });

// Driver earning record — one per delivered order
const driverEarningSchema = new mongoose.Schema({
  driverId:     { type: mongoose.Schema.Types.ObjectId, ref: 'DriverProfile', required: true },
  orderId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Order',         required: true, unique: true },
  waybillNumber:{ type: String },
  orderAmount:  { type: Number, required: true },   // total order value
  commission:   { type: Number, required: true },   // driver's cut (15%)
  earnedAt:     { type: Date, default: Date.now },
  originCity:   { type: String },
  destinationCity: { type: String },
}, { timestamps: true });

// ── Zone — admin-configurable geographic regions ────────────────────────────
const zoneSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  states:      [{ type: String, lowercase: true, trim: true }],
  isActive:    { type: Boolean, default: true },
  sortOrder:   { type: Number, default: 0 },
}, { timestamps: true });

// ── Truck Type — vehicle capacity tiers for pricing ───────────────────────
const truckTypeSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  description:  { type: String, trim: true, default: '' },
  capacityTons: { type: Number, required: true, min: 0 },
  icon:         { type: String, default: '🚛' },
  sortOrder:    { type: Number, default: 0 },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

// ── Pricing Rule — price for origin zone → dest zone × truck type ────────
const pricingRuleSchema = new mongoose.Schema({
  fromZoneId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Zone',      required: true },
  toZoneId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Zone',      required: true },
  truckTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'TruckType', required: true },
  price:       { type: Number, required: true, min: 0 },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });
pricingRuleSchema.index({ fromZoneId: 1, toZoneId: 1, truckTypeId: 1 }, { unique: true });

// ── OTP Token — for email verification and password reset ──────────────────
// Security design:
//   • OTP is bcrypt-hashed (10 rounds) — never stored in plain text
//   • MongoDB TTL index auto-deletes documents after expiresAt
//   • attempts field enforces max-retry limit at application level
//   • usedAt set on success — enforces single-use
//   • compound index { email, purpose } for fast, consistent lookup
const otpTokenSchema = new mongoose.Schema({
  email:     { type: String, required: true, lowercase: true, trim: true },
  hashedOtp: { type: String, required: true },
  purpose:   {
    type: String,
    enum: ['email_verification', 'password_reset'],
    required: true,
  },
  expiresAt: { type: Date, required: true },  // enforced in code AND TTL index
  attempts:  { type: Number, default: 0 },    // wrong guesses; capped at 5
  usedAt:    { type: Date, default: null },    // null = unused, Date = single-use consumed
}, { timestamps: true });

// MongoDB TTL: auto-remove document the moment expiresAt is reached (±60s jitter)
otpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Fast lookup: always query by email + purpose together
otpTokenSchema.index({ email: 1, purpose: 1 });

export const User           = mongoose.model('User', userSchema);
export const DriverProfile  = mongoose.model('DriverProfile', driverProfileSchema);
export const Order          = mongoose.model('Order', orderSchema);
export const Payment        = mongoose.model('Payment', paymentSchema);
export const TrackingEvent  = mongoose.model('TrackingEvent', trackingEventSchema);
export const Notification   = mongoose.model('Notification', notificationSchema);
export const Review         = mongoose.model('Review', reviewSchema);
export const DriverEarning  = mongoose.model('DriverEarning', driverEarningSchema);
export const OtpToken       = mongoose.model('OtpToken', otpTokenSchema);
export const Zone         = mongoose.model('Zone', zoneSchema);
export const TruckType    = mongoose.model('TruckType', truckTypeSchema);
export const PricingRule  = mongoose.model('PricingRule', pricingRuleSchema);

export default connectDB;
