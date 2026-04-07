/**
 * Fleet Management Routes — /api/fleet
 *
 * Manages the company vehicle pool independently of driver profiles.
 * Vehicles can be assigned to / unassigned from drivers.
 * Compliance dates (insurance, roadworthiness) are tracked and surfaced
 * when they fall within 30 days of expiry.
 */
import { Router } from 'express';
import { Vehicle, DriverProfile } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { logAction } from '../utils/auditLog.js';

const router = Router();

// ── Helpers ──────────────────────────────────────────────
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

// ── GET /api/fleet/stats ─────────────────────────────────
router.get('/stats', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const expiryCutoff = new Date(Date.now() + THIRTY_DAYS);
    const [total, active, maintenance, retired, unassigned, expiringSoon] = await Promise.all([
      Vehicle.countDocuments(),
      Vehicle.countDocuments({ status: 'active' }),
      Vehicle.countDocuments({ status: 'maintenance' }),
      Vehicle.countDocuments({ status: 'retired' }),
      Vehicle.countDocuments({ status: 'active', assignedDriverId: null }),
      Vehicle.countDocuments({
        status: { $ne: 'retired' },
        $or: [
          { insuranceExpiry:      { $lte: expiryCutoff, $ne: null } },
          { roadworthinessExpiry: { $lte: expiryCutoff, $ne: null } },
        ],
      }),
    ]);
    res.json({ success: true, data: { total, active, maintenance, retired, unassigned, expiringSoon } });
  } catch (e) { next(e); }
});

// ── GET /api/fleet ───────────────────────────────────────
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { status, vehicleType, search, page = 1, limit = 20 } = req.query;
    const pg = Math.max(1, +page);
    const lm = Math.min(50, Math.max(1, +limit));

    const filter = {};
    if (status)      filter.status      = status;
    if (vehicleType) filter.vehicleType = vehicleType;
    if (search) {
      const safe = escapeRegex(search);
      filter.$or = [
        { plateNumber: new RegExp(safe, 'i') },
        { make:        new RegExp(safe, 'i') },
        { model:       new RegExp(safe, 'i') },
      ];
    }

    const total = await Vehicle.countDocuments(filter);
    const vehicles = await Vehicle.find(filter)
      .populate({
        path: 'assignedDriverId',
        populate: { path: 'userId', select: 'firstName lastName phone' },
      })
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lm)
      .limit(lm)
      .lean();

    // Flag any vehicle whose compliance docs expire within 30 days
    const now = Date.now();
    const flagged = vehicles.map(v => ({
      ...v,
      insuranceWarning:      v.insuranceExpiry      && new Date(v.insuranceExpiry).getTime()      - now < THIRTY_DAYS,
      roadworthinessWarning: v.roadworthinessExpiry && new Date(v.roadworthinessExpiry).getTime() - now < THIRTY_DAYS,
    }));

    res.json({
      success: true,
      data: { vehicles: flagged, pagination: { total, page: pg, limit: lm, pages: Math.ceil(total / lm) } },
    });
  } catch (e) { next(e); }
});

// ── GET /api/fleet/:id ───────────────────────────────────
router.get('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id)
      .populate({ path: 'assignedDriverId', populate: { path: 'userId', select: 'firstName lastName phone email' } })
      .lean();
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    res.json({ success: true, data: vehicle });
  } catch (e) { next(e); }
});

// ── POST /api/fleet ──────────────────────────────────────
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const {
      plateNumber, make, model, year, color, vehicleType, capacityTons,
      insuranceExpiry, roadworthinessExpiry, lastServiceDate, nextServiceDate,
      mileage, notes,
    } = req.body;

    if (!plateNumber || !make || !model || !year || !vehicleType)
      return res.status(400).json({ success: false, message: 'Required: plateNumber, make, model, year, vehicleType' });

    const plateClean = plateNumber.toUpperCase().trim();

    if (await Vehicle.findOne({ plateNumber: plateClean }))
      return res.status(409).json({ success: false, message: `Vehicle with plate ${plateClean} already exists` });

    const vehicle = await Vehicle.create({
      plateNumber:  plateClean,
      make:         make.trim(),
      model:        model.trim(),
      year:         +year,
      color:        (color || '').trim(),
      vehicleType,
      capacityTons: +capacityTons || 0,
      insuranceExpiry:      insuranceExpiry      ? new Date(insuranceExpiry)      : null,
      roadworthinessExpiry: roadworthinessExpiry ? new Date(roadworthinessExpiry) : null,
      lastServiceDate:      lastServiceDate      ? new Date(lastServiceDate)      : null,
      nextServiceDate:      nextServiceDate      ? new Date(nextServiceDate)      : null,
      mileage: +mileage || 0,
      notes:   (notes || '').trim(),
    });

    await logAction(req, 'fleet.vehicle_added', 'Vehicle', vehicle._id,
      { plateNumber: vehicle.plateNumber, make, model, vehicleType });

    res.status(201).json({ success: true, message: `Vehicle ${vehicle.plateNumber} added to fleet`, data: vehicle });
  } catch (e) { next(e); }
});

// ── PUT /api/fleet/:id ───────────────────────────────────
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    const ALLOWED = [
      'make','model','year','color','vehicleType','capacityTons','status',
      'insuranceExpiry','roadworthinessExpiry','lastServiceDate','nextServiceDate',
      'mileage','notes',
    ];

    const changes = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) changes[key] = req.body[key];
    }
    // Coerce date fields
    for (const df of ['insuranceExpiry','roadworthinessExpiry','lastServiceDate','nextServiceDate']) {
      if (changes[df] !== undefined) {
        changes[df] = changes[df] ? new Date(changes[df]) : null;
      }
    }

    Object.assign(vehicle, changes);
    await vehicle.save();

    await logAction(req, 'fleet.vehicle_updated', 'Vehicle', vehicle._id, changes);

    res.json({ success: true, message: 'Vehicle updated', data: vehicle });
  } catch (e) { next(e); }
});

// ── PUT /api/fleet/:id/assign ────────────────────────────
router.put('/:id/assign', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { driverId } = req.body;

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    if (driverId) {
      const driver = await DriverProfile.findById(driverId);
      if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

      // One vehicle per driver — warn if the driver is already assigned another
      const existing = await Vehicle.findOne({ assignedDriverId: driverId, _id: { $ne: vehicle._id } });
      if (existing)
        return res.status(409).json({
          success: false,
          message: `Driver is already assigned to vehicle ${existing.plateNumber}. Unassign first.`,
        });
    }

    const prev = vehicle.assignedDriverId;
    vehicle.assignedDriverId = driverId || null;
    await vehicle.save();

    await logAction(req, driverId ? 'fleet.driver_assigned' : 'fleet.driver_unassigned',
      'Vehicle', vehicle._id, { vehiclePlate: vehicle.plateNumber, prev, new: driverId || null });

    res.json({ success: true, message: driverId ? 'Driver assigned to vehicle' : 'Driver unassigned from vehicle' });
  } catch (e) { next(e); }
});

// ── DELETE /api/fleet/:id ────────────────────────────────
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    vehicle.isActive = false;
    vehicle.status   = 'retired';
    vehicle.assignedDriverId = null;
    await vehicle.save();

    await logAction(req, 'fleet.vehicle_retired', 'Vehicle', vehicle._id,
      { plateNumber: vehicle.plateNumber }, 'warning');

    res.json({ success: true, message: `Vehicle ${vehicle.plateNumber} retired from fleet` });
  } catch (e) { next(e); }
});

export default router;
