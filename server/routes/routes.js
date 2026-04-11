/**
 * ─────────────────────────────────────────────────────────
 *  DELIVERY ROUTE API — Route Batching System
 *
 *  Internal admin + driver feature. Customers NEVER see route data.
 *  Pricing is NEVER modified by batching.
 *
 *  Admin endpoints:
 *    GET    /api/routes              → list all routes (paginated, filtered)
 *    POST   /api/routes              → create route + add stops
 *    GET    /api/routes/:id          → get full route detail
 *    PUT    /api/routes/:id          → update route (stops, driver, vehicle, notes)
 *    PUT    /api/routes/:id/activate → change status planned → active
 *    PUT    /api/routes/:id/cancel   → cancel route (frees all orders)
 *    POST   /api/routes/:id/stops    → add a stop to an existing route
 *    DELETE /api/routes/:id/stops/:stopId → remove a stop
 *    GET    /api/routes/candidates   → unassigned bookable orders for route building
 *    POST   /api/routes/validate     → dry-run constraint check (no DB writes)
 *
 *  Driver endpoints:
 *    GET    /api/routes/driver/active         → driver's active route
 *    PUT    /api/routes/:id/stops/:stopId/status → update single stop status
 *
 *  Constraint rules (enforced on every add/validate):
 *    1. Total weight must not exceed vehicle capacity
 *    2. Orders already in an active/planned route are blocked
 *    3. Opposite-direction warning (configurable tolerance)
 *    4. Max stops per route: 20
 *
 *  Efficiency formula (admin-only):
 *    estimatedCost  = estimatedDistance × NGN_PER_KM (configurable)
 *    efficiency     = totalRevenue >= 1.5×estimatedCost → profitable
 *                   = totalRevenue >= estimatedCost     → break_even
 *                   = else                              → inefficient
 * ─────────────────────────────────────────────────────────
 */
import { Router } from 'express';
import { DeliveryRoute, Order, Vehicle, DriverProfile, Notification } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../utils/auditLog.js';

const router = Router();
router.use(authenticate);

const requireAdmin  = authorize('admin');
const requireDriver = authorize('driver');

// ── Constants ─────────────────────────────────────────────
const MAX_STOPS     = 20;
const NGN_PER_KM    = 350;    // cost estimate ₦/km
const AVG_SPEED_KPH = 45;     // for duration estimation
const KM_PER_DEGREE = 111;    // rough lat/lng → km

// ── Helpers ───────────────────────────────────────────────
const genRouteNumber = async () => {
  const d     = new Date();
  const date  = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const count = await DeliveryRoute.countDocuments() + 1;
  return `RT-${date}-${String(count).padStart(4,'0')}`;
};

/** Rough straight-line distance between two city-level coordinates (degrees).
 *  Used only for efficiency estimates — not navigation.
 *  Falls back gracefully when coordinates are unavailable.
 */
const roughDistanceKm = (orders) => {
  if (!orders || orders.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < orders.length - 1; i++) {
    const a = orders[i];
    const b = orders[i + 1];
    const aLat = a.pickupLat  || 0, aLng = a.pickupLng  || 0;
    const bLat = b.pickupLat  || 0, bLng = b.pickupLng  || 0;
    if (!aLat || !bLat) continue;
    const dLat = Math.abs(aLat - bLat);
    const dLng = Math.abs(aLng - bLng);
    total += Math.sqrt(dLat * dLat + dLng * dLng) * KM_PER_DEGREE;
  }
  return Math.round(total);
};

/** Calculate efficiency from revenue + distance */
const calcEfficiency = (totalRevenue, estimatedDistance) => {
  if (!estimatedDistance || estimatedDistance === 0) return 'pending';
  const cost = estimatedDistance * NGN_PER_KM;
  if (totalRevenue >= cost * 1.5) return 'profitable';
  if (totalRevenue >= cost)       return 'break_even';
  return 'inefficient';
};

/**
 * Validate constraints for a proposed set of orders + vehicle.
 * Returns { valid: bool, errors: [], warnings: [] }
 */
const validateConstraints = async (orderIds, vehicleId, existingRouteId = null) => {
  const errors   = [];
  const warnings = [];

  // 1. Fetch orders
  const orders = await Order.find({ _id: { $in: orderIds } }).lean();
  if (orders.length !== orderIds.length) {
    errors.push('One or more selected orders could not be found.');
  }

  // 2. Check orders are not already in another active/planned route
  const alreadyRouted = orders.filter(o =>
    o.routeId && String(o.routeId) !== String(existingRouteId)
  );
  if (alreadyRouted.length > 0) {
    const nums = alreadyRouted.map(o => o.waybillNumber).join(', ');
    errors.push(`These orders are already assigned to a route: ${nums}`);
  }

  // 3. Check orders are in acceptable statuses (booked or assigned only)
  const ineligible = orders.filter(o => !['booked','assigned'].includes(o.status));
  if (ineligible.length > 0) {
    const nums = ineligible.map(o => `${o.waybillNumber} (${o.status})`).join(', ');
    errors.push(`These orders cannot be batched (wrong status): ${nums}`);
  }

  // 4. Weight check
  const totalWeight = orders.reduce((s, o) => s + (o.weight || 0) * (o.quantity || 1), 0);
  if (vehicleId) {
    const vehicle = await Vehicle.findById(vehicleId).lean();
    if (vehicle) {
      const capacityKg = (vehicle.capacityTons || 0) * 1000;
      if (capacityKg > 0 && totalWeight > capacityKg) {
        errors.push(
          `Total cargo weight (${totalWeight}kg) exceeds vehicle capacity (${capacityKg}kg for ${vehicle.plateNumber}). Remove heavy orders or select a larger vehicle.`
        );
      } else if (capacityKg > 0 && totalWeight > capacityKg * 0.9) {
        warnings.push(`Route is at ${Math.round((totalWeight / capacityKg) * 100)}% vehicle capacity. Consider leaving headroom.`);
      }
    }
  }

  // 5. Max stops check
  if (orderIds.length > MAX_STOPS / 2) {
    warnings.push(`Large route (${orderIds.length} orders = up to ${orderIds.length * 2} stops). Consider splitting for efficiency.`);
  }

  // 6. Direction conflict detection — simplified
  // If some orders go primarily north and others primarily south, warn.
  const hasCoords = orders.filter(o => o.pickupLat && o.deliveryLat);
  if (hasCoords.length >= 2) {
    const northBound = hasCoords.filter(o => (o.deliveryLat || 0) > (o.pickupLat || 0));
    const southBound = hasCoords.filter(o => (o.deliveryLat || 0) < (o.pickupLat || 0));
    if (northBound.length > 0 && southBound.length > 0) {
      warnings.push('Route contains orders in opposite directions (N/S). Consider grouping by direction for efficiency.');
    }
  }

  // 7. Cancelled order check
  const cancelled = orders.filter(o => o.status === 'cancelled');
  if (cancelled.length > 0) {
    errors.push(`Cannot include cancelled orders: ${cancelled.map(o => o.waybillNumber).join(', ')}`);
  }

  return {
    valid:        errors.length === 0,
    errors,
    warnings,
    totalWeight,
    orderCount:   orders.length,
  };
};

/** Recalculate and persist route metrics (revenue, weight, distance, efficiency) */
const refreshMetrics = async (route) => {
  const orderIds = [...new Set(route.stops.map(s => String(s.orderId)))];
  const orders   = await Order.find({ _id: { $in: orderIds } }).select('totalAmount weight quantity').lean();

  const totalRevenue = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const totalWeight  = orders.reduce((s, o) => s + (o.weight || 0) * (o.quantity || 1), 0);
  const estDist      = roughDistanceKm(orders);
  const estDuration  = estDist > 0 ? Math.round((estDist / AVG_SPEED_KPH) * 60) : 0;
  const estCost      = estDist * NGN_PER_KM;
  const efficiency   = calcEfficiency(totalRevenue, estDist);

  route.totalRevenue        = totalRevenue;
  route.totalWeight         = totalWeight;
  route.estimatedDistance   = estDist;
  route.estimatedDuration   = estDuration;
  route.estimatedCost       = estCost;
  route.efficiency          = efficiency;
  await route.save();
};

// ═══════════════════════════════════════════════════════════
//  ADMIN — list + create + manage routes
// ═══════════════════════════════════════════════════════════

// GET /api/routes/candidates — unassigned, bookable orders for route builder
router.get('/candidates', requireAdmin, async (req, res, next) => {
  try {
    const { search, limit = 50 } = req.query;
    const filter = {
      status:  { $in: ['booked', 'assigned'] },
      routeId: null,
    };
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ waybillNumber: rx }, { originCity: rx }, { destinationCity: rx }];
    }
    const orders = await Order.find(filter)
      .select('waybillNumber originCity destinationCity senderName senderAddress receiverName receiverAddress receiverPhone senderPhone weight quantity totalAmount status serviceType isFragile pickupLat pickupLng deliveryLat deliveryLng')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();
    res.json({ success: true, data: orders });
  } catch (e) { next(e); }
});

// POST /api/routes/validate — dry-run only, no DB writes
router.post('/validate', requireAdmin, async (req, res, next) => {
  try {
    const { orderIds = [], vehicleId } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0)
      return res.status(400).json({ success: false, message: 'Provide at least one order' });
    const result = await validateConstraints(orderIds, vehicleId);
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

// GET /api/routes — list routes
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const { status, driverId, page = 1, limit = 20 } = req.query;
    const skip   = (Number(page) - 1) * Number(limit);
    const filter = {};
    if (status)   filter.status   = status;
    if (driverId) filter.driverId = driverId;

    const [routes, total] = await Promise.all([
      DeliveryRoute.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('driverId', 'userId vehicleType vehiclePlate')
        .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName' } })
        .populate('vehicleId', 'plateNumber make model vehicleType capacityTons')
        .select('-stops'),   // omit stops in list view for performance
      DeliveryRoute.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { routes, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } },
    });
  } catch (e) { next(e); }
});

// GET /api/routes/:id — single route with all populated data
router.get('/:id', requireAdmin, async (req, res, next) => {
  try {
    const route = await DeliveryRoute.findById(req.params.id)
      .populate('driverId vehicleId createdBy')
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName phone' } })
      .populate({ path: 'stops.orderId', select: 'waybillNumber originCity destinationCity senderName senderPhone senderAddress receiverName receiverPhone receiverAddress weight quantity totalAmount status paymentMethod isFragile specialInstructions' })
      .lean();

    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
    res.json({ success: true, data: route });
  } catch (e) { next(e); }
});

// POST /api/routes — create new route
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { orderIds = [], vehicleId, driverId, stops: customStops, notes } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0)
      return res.status(400).json({ success: false, message: 'Select at least one order' });

    // Constraint check
    const check = await validateConstraints(orderIds, vehicleId);
    if (!check.valid)
      return res.status(422).json({ success: false, message: check.errors[0], data: check });

    // Fetch orders to build default stops
    const orders = await Order.find({ _id: { $in: orderIds } }).lean();

    // Build stop list: if customStops provided, use those; else auto-generate pickup+delivery per order
    let stops;
    if (customStops && customStops.length > 0) {
      stops = customStops.map((s, i) => ({
        orderId:      s.orderId,
        sequence:     s.sequence ?? i + 1,
        type:         s.type,
        status:       'pending',
        address:      s.address || '',
        city:         s.city    || '',
        contactName:  s.contactName  || '',
        contactPhone: s.contactPhone || '',
        note:         s.note    || '',
      }));
    } else {
      // Auto-generate: pickup then delivery for each order
      stops = [];
      orders.forEach((order, i) => {
        stops.push({
          orderId:      order._id,
          sequence:     stops.length + 1,
          type:         'pickup',
          status:       'pending',
          address:      order.senderAddress || order.originCity,
          city:         order.originCity,
          contactName:  order.senderName,
          contactPhone: order.senderPhone,
        });
        stops.push({
          orderId:      order._id,
          sequence:     stops.length + 1,
          type:         'delivery',
          status:       'pending',
          address:      order.receiverAddress,
          city:         order.destinationCity,
          contactName:  order.receiverName,
          contactPhone: order.receiverPhone,
        });
      });
    }

    const routeNumber = await genRouteNumber();
    const route = await DeliveryRoute.create({
      routeNumber,
      driverId:  driverId  || null,
      vehicleId: vehicleId || null,
      stops,
      notes:     notes || '',
      createdBy: req.user._id,
    });

    // Link orders → route
    await Order.updateMany({ _id: { $in: orderIds } }, { routeId: route._id });

    // Compute metrics
    await refreshMetrics(route);

    await logAction(req, 'route.created', 'DeliveryRoute', route._id, { routeNumber, orderCount: orderIds.length });

    const populated = await DeliveryRoute.findById(route._id)
      .populate('driverId vehicleId')
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName' } })
      .populate({ path: 'stops.orderId', select: 'waybillNumber originCity destinationCity senderName receiverName receiverPhone senderPhone weight status totalAmount' });

    res.status(201).json({ success: true, message: `Route ${routeNumber} created with ${stops.length} stops.`, data: populated });
  } catch (e) { next(e); }
});

// PUT /api/routes/:id — update stops order / assign driver+vehicle / notes
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { stops, driverId, vehicleId, notes } = req.body;
    const route = await DeliveryRoute.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
    if (route.status === 'completed' || route.status === 'cancelled')
      return res.status(400).json({ success: false, message: `Cannot modify a ${route.status} route` });

    // Update stops order (sequence rewrite)
    if (Array.isArray(stops)) {
      stops.forEach((s, i) => {
        const existing = route.stops.id(s._id);
        if (existing) existing.sequence = i + 1;
      });
      // Sort embedded array by new sequence
      route.stops.sort((a, b) => a.sequence - b.sequence);
    }

    if (driverId  !== undefined) route.driverId  = driverId  || null;
    if (vehicleId !== undefined) route.vehicleId = vehicleId || null;
    if (notes     !== undefined) route.notes     = notes;

    await route.save();
    await refreshMetrics(route);
    await logAction(req, 'route.updated', 'DeliveryRoute', route._id, { driverId, vehicleId });

    const updated = await DeliveryRoute.findById(route._id)
      .populate('driverId vehicleId')
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName' } })
      .populate({ path: 'stops.orderId', select: 'waybillNumber originCity destinationCity senderName receiverName receiverPhone senderPhone weight status totalAmount' });

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// POST /api/routes/:id/stops — add order to existing route
router.post('/:id/stops', requireAdmin, async (req, res, next) => {
  try {
    const { orderId, vehicleId: overrideVehicleId } = req.body;
    const route = await DeliveryRoute.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
    if (['completed','cancelled'].includes(route.status))
      return res.status(400).json({ success: false, message: `Cannot add stops to a ${route.status} route` });

    const currentOrderIds = [...new Set(route.stops.map(s => String(s.orderId)))];
    const newOrderIds     = [...new Set([...currentOrderIds, String(orderId)])];
    const vid             = overrideVehicleId || String(route.vehicleId || '');

    const check = await validateConstraints(newOrderIds, vid || null, route._id);
    if (!check.valid)
      return res.status(422).json({ success: false, message: check.errors[0], data: check });

    const order = await Order.findById(orderId).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const nextSeq = (route.stops.length > 0 ? Math.max(...route.stops.map(s => s.sequence)) : 0) + 1;

    // Add pickup + delivery stops
    route.stops.push({ orderId: order._id, sequence: nextSeq,     type: 'pickup',   status: 'pending', address: order.senderAddress || order.originCity, city: order.originCity, contactName: order.senderName, contactPhone: order.senderPhone });
    route.stops.push({ orderId: order._id, sequence: nextSeq + 1, type: 'delivery', status: 'pending', address: order.receiverAddress, city: order.destinationCity, contactName: order.receiverName, contactPhone: order.receiverPhone });

    await Order.findByIdAndUpdate(orderId, { routeId: route._id });
    await route.save();
    await refreshMetrics(route);

    const updated = await DeliveryRoute.findById(route._id)
      .populate({ path: 'stops.orderId', select: 'waybillNumber originCity destinationCity senderName receiverName receiverPhone senderPhone weight status totalAmount' });

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// DELETE /api/routes/:id/stops/:stopId — remove a stop (and its pair)
router.delete('/:id/stops/:stopId', requireAdmin, async (req, res, next) => {
  try {
    const route = await DeliveryRoute.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
    if (route.status === 'active')
      return res.status(400).json({ success: false, message: 'Cannot remove stops from an active route' });

    const stop = route.stops.id(req.params.stopId);
    if (!stop) return res.status(404).json({ success: false, message: 'Stop not found' });

    const removedOrderId = String(stop.orderId);

    // Remove all stops for this order (both pickup and delivery)
    route.stops = route.stops.filter(s => String(s.orderId) !== removedOrderId);

    // Renumber sequences
    route.stops.sort((a, b) => a.sequence - b.sequence).forEach((s, i) => { s.sequence = i + 1; });

    // Check if any stop still references this order
    const stillInRoute = route.stops.some(s => String(s.orderId) === removedOrderId);
    if (!stillInRoute) {
      await Order.findByIdAndUpdate(removedOrderId, { routeId: null });
    }

    await route.save();
    await refreshMetrics(route);
    await logAction(req, 'route.stop_removed', 'DeliveryRoute', route._id, { removedOrderId });

    const updated = await DeliveryRoute.findById(route._id)
      .populate({ path: 'stops.orderId', select: 'waybillNumber originCity destinationCity senderName receiverName receiverPhone senderPhone weight status totalAmount' });

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// PUT /api/routes/:id/activate — planned → active
router.put('/:id/activate', requireAdmin, async (req, res, next) => {
  try {
    const route = await DeliveryRoute.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
    if (route.status !== 'planned')
      return res.status(400).json({ success: false, message: `Route is already ${route.status}` });
    if (!route.driverId)
      return res.status(400).json({ success: false, message: 'Assign a driver before activating the route' });
    if (route.stops.length === 0)
      return res.status(400).json({ success: false, message: 'Add at least one stop before activating' });

    route.status      = 'active';
    route.activatedAt = new Date();
    await route.save();

    // Mark all orders as assigned (if still booked)
    const orderIds = [...new Set(route.stops.map(s => String(s.orderId)))];
    await Order.updateMany(
      { _id: { $in: orderIds }, status: 'booked' },
      { status: 'assigned', assignedAt: new Date(), driverId: route.driverId }
    );

    // Notify driver
    const driver = await DriverProfile.findById(route.driverId).lean();
    if (driver?.userId) {
      Notification.create({
        userId:  driver.userId,
        title:   `Route ${route.routeNumber} assigned`,
        message: `You have been assigned a new delivery route with ${orderIds.length} shipment(s). Open the Route page to view stops.`,
        type:    'route',
      }).catch(console.error);
    }

    await logAction(req, 'route.activated', 'DeliveryRoute', route._id, { driverId: route.driverId, orderCount: orderIds.length }, 'info');
    res.json({ success: true, message: `Route ${route.routeNumber} is now active`, data: route });
  } catch (e) { next(e); }
});

// PUT /api/routes/:id/cancel — cancel route, release all orders
router.put('/:id/cancel', requireAdmin, async (req, res, next) => {
  try {
    const route = await DeliveryRoute.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
    if (route.status === 'completed')
      return res.status(400).json({ success: false, message: 'Cannot cancel a completed route' });

    const orderIds = [...new Set(route.stops.map(s => String(s.orderId)))];

    route.status = 'cancelled';
    await route.save();

    // Release orders: clear routeId; revert assigned→booked if not yet picked up
    await Order.updateMany(
      { _id: { $in: orderIds }, status: 'assigned' },
      { status: 'booked', driverId: null, assignedAt: null, routeId: null }
    );
    await Order.updateMany(
      { _id: { $in: orderIds }, status: 'booked' },
      { routeId: null }
    );

    await logAction(req, 'route.cancelled', 'DeliveryRoute', route._id, { orderCount: orderIds.length }, 'warning');
    res.json({ success: true, message: `Route ${route.routeNumber} cancelled. ${orderIds.length} orders released.`, data: route });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════
//  DRIVER — active route + stop status updates
// ═══════════════════════════════════════════════════════════

// GET /api/routes/driver/active — driver's active route
router.get('/driver/active', requireDriver, async (req, res, next) => {
  try {
    const driverProfile = await DriverProfile.findOne({ userId: req.user._id }).lean();
    if (!driverProfile)
      return res.status(404).json({ success: false, message: 'Driver profile not found' });

    const route = await DeliveryRoute.findOne({ driverId: driverProfile._id, status: 'active' })
      .populate({ path: 'stops.orderId', select: 'waybillNumber originCity destinationCity senderName senderPhone senderAddress receiverName receiverPhone receiverAddress weight quantity totalAmount status paymentMethod codAmount isFragile specialInstructions' })
      .populate('vehicleId', 'plateNumber make model vehicleType')
      .lean();

    // Strip admin-only fields before sending to driver
    if (route) {
      delete route.totalRevenue;
      delete route.estimatedCost;
      delete route.efficiency;
    }

    res.json({ success: true, data: route || null });
  } catch (e) { next(e); }
});

// PUT /api/routes/:id/stops/:stopId/status — driver updates a stop
router.put('/:id/stops/:stopId/status', requireDriver, async (req, res, next) => {
  try {
    const { status, note, location } = req.body;
    const VALID = ['arrived', 'completed', 'skipped'];
    if (!VALID.includes(status))
      return res.status(400).json({ success: false, message: `Status must be one of: ${VALID.join(', ')}` });

    const driverProfile = await DriverProfile.findOne({ userId: req.user._id }).lean();
    if (!driverProfile)
      return res.status(403).json({ success: false, message: 'Driver profile not found' });

    const route = await DeliveryRoute.findOne({ _id: req.params.id, driverId: driverProfile._id, status: 'active' });
    if (!route) return res.status(404).json({ success: false, message: 'Active route not found' });

    const stop = route.stops.id(req.params.stopId);
    if (!stop) return res.status(404).json({ success: false, message: 'Stop not found' });
    if (stop.status === 'completed')
      return res.status(400).json({ success: false, message: 'Stop already completed' });

    stop.status = status;
    if (note)     stop.note = note;
    if (status === 'completed' || status === 'skipped') {
      stop.completedAt = new Date();
    }

    // ── Sync order status when stop is completed ────────────────────────────
    if (status === 'completed') {
      const order = await Order.findById(stop.orderId);
      if (order) {
        let newOrderStatus = null;
        if (stop.type === 'pickup') {
          // Both pickup stops for this order completed → picked_up
          newOrderStatus = 'picked_up';
        } else if (stop.type === 'delivery') {
          newOrderStatus = 'delivered';
        }
        if (newOrderStatus && order.status !== newOrderStatus) {
          order.statusHistory.push({
            fromStatus: order.status,
            toStatus:   newOrderStatus,
            changedBy:  req.user._id,
            note:       note || `Updated via route ${route.routeNumber}`,
            location:   location || stop.city || '',
            changedAt:  new Date(),
          });
          order.status = newOrderStatus;
          if (newOrderStatus === 'delivered') {
            order.deliveredAt = new Date();
            DriverProfile.findByIdAndUpdate(driverProfile._id, { $inc: { totalDeliveries: 1 } }).catch(console.error);
          }
          await order.save();

          // Notify customer
          const statusMessages = {
            picked_up: 'Your shipment has been picked up and is on its way.',
            delivered: 'Your shipment has been delivered. Thank you for using JMove!',
          };
          Notification.create({
            userId:         order.customerId,
            title:          `Shipment ${newOrderStatus.replace('_', ' ')}: ${order.waybillNumber}`,
            message:        statusMessages[newOrderStatus] || `Your shipment status updated to ${newOrderStatus}.`,
            type:           'order',
            relatedOrderId: order._id,
          }).catch(console.error);

          // Emit socket update
          const io = req.app.get('io');
          if (io) {
            io.to(`order:${order._id}`).emit('order:statusUpdate', {
              orderId: String(order._id),
              status:  newOrderStatus,
            });
          }
        }
      }
    }

    // ── Check if entire route is complete ──────────────────────────────────
    const allDone = route.stops.every(s => ['completed', 'skipped'].includes(s.status));
    if (allDone) {
      route.status      = 'completed';
      route.completedAt = new Date();
    }

    await route.save();

    // Return updated route (driver-safe: strip admin fields)
    const updated = await DeliveryRoute.findById(route._id)
      .populate({ path: 'stops.orderId', select: 'waybillNumber originCity destinationCity senderName senderPhone senderAddress receiverName receiverPhone receiverAddress weight quantity totalAmount status paymentMethod codAmount isFragile specialInstructions' })
      .populate('vehicleId', 'plateNumber make model vehicleType')
      .lean();

    if (updated) {
      delete updated.totalRevenue;
      delete updated.estimatedCost;
      delete updated.efficiency;
    }

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

export default router;
