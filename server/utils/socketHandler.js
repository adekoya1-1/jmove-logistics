/**
 * ─────────────────────────────────────────────────────────
 *  HARDENED SOCKET.IO HANDLER
 *
 *  Security improvements:
 *  1. JWT auth middleware validates token on connection
 *  2. tokenVersion check (invalidates tokens after password change)
 *  3. Payload validation on all incoming events
 *  4. Rate-limit location updates (1/sec per socket)
 *  5. Driver can only update location for their own assigned order
 *  6. Status changes rejected if not authenticated driver
 * ─────────────────────────────────────────────────────────
 */
import jwt from 'jsonwebtoken';
import { User, DriverProfile, TrackingEvent } from '../db.js';

// ── Simple per-socket rate limiter ───────────────────────
const socketRateLimit = new Map(); // socketId → { count, resetAt }
const LOCATION_LIMIT = 60;        // max 60 location events per minute
const LIMIT_WINDOW   = 60 * 1000; // 1 minute

const checkSocketRate = (socketId) => {
  const now   = Date.now();
  const entry = socketRateLimit.get(socketId) || { count: 0, resetAt: now + LIMIT_WINDOW };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + LIMIT_WINDOW; }
  entry.count++;
  socketRateLimit.set(socketId, entry);
  return entry.count <= LOCATION_LIMIT;
};

// ── Coordinate validator ─────────────────────────────────
const isValidCoord = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
  isFinite(lat) && isFinite(lng);

export default (io) => {

  // ── Auth middleware ──────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token ||
                    socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token || token.length > 512)
        return next(new Error('Authentication required'));

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (err) {
        return next(new Error(err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'));
      }

      const user = await User.findById(decoded.userId)
        .select('firstName lastName role isActive tokenVersion')
        .lean();

      if (!user?.isActive)
        return next(new Error('User not found or inactive'));

      // Token version check
      if (user.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion)
        return next(new Error('Session invalidated'));

      socket.user = user;
      next();
    } catch { next(new Error('Authentication error')); }
  });

  io.on('connection', (socket) => {
    const { user } = socket;

    socket.join(`user:${user._id}`);
    if (user.role === 'admin')  socket.join('admin:room');
    if (user.role === 'driver') socket.join('drivers:room');

    // ── Customer subscribes to order updates ──────────────
    socket.on('order:subscribe', ({ orderId } = {}) => {
      if (!orderId || typeof orderId !== 'string' || orderId.length > 30) return;
      socket.join(`order:${orderId}`);
      socket.emit('order:subscribed', { orderId });
    });

    socket.on('order:unsubscribe', ({ orderId } = {}) => {
      if (!orderId || typeof orderId !== 'string') return;
      socket.leave(`order:${orderId}`);
    });

    // ── Driver pushes GPS location ────────────────────────
    socket.on('driver:updateLocation', async ({ lat, lng, orderId } = {}) => {
      if (user.role !== 'driver') return;

      // Rate limit: max 60 location updates per minute
      if (!checkSocketRate(socket.id)) {
        socket.emit('error', { message: 'Location update rate exceeded' });
        return;
      }

      // Validate coordinates
      if (!isValidCoord(lat, lng)) return;

      // Validate orderId if provided
      if (orderId && (typeof orderId !== 'string' || orderId.length > 30)) return;

      try {
        const dp = await DriverProfile.findOne({ userId: user._id });
        if (!dp) return;

        await DriverProfile.findByIdAndUpdate(dp._id, {
          currentLat: lat, currentLng: lng, locationUpdatedAt: new Date()
        });

        if (orderId) {
          // Verify this driver owns this order before recording
          const { Order } = await import('../db.js');
          const order = await Order.findOne({ _id: orderId, driverId: dp._id }).lean();
          if (!order) return;  // driver tried to attach location to someone else's order

          await TrackingEvent.create({ orderId, driverId: dp._id, lat, lng });
          io.to(`order:${orderId}`).emit('driver:locationUpdate', { lat, lng, orderId, driverId: dp._id, timestamp: new Date() });
        }

        io.to('admin:room').emit('driver:locationUpdate', { lat, lng, orderId, driverId: dp._id, userId: user._id, timestamp: new Date() });
      } catch (e) { console.error('[Socket:location]', e.message); }
    });

    // ── Driver changes their status ───────────────────────
    socket.on('driver:statusChange', async ({ status } = {}) => {
      if (user.role !== 'driver') return;
      if (!['available', 'busy', 'offline'].includes(status)) return;
      try {
        await DriverProfile.findOneAndUpdate({ userId: user._id }, { status });
        io.to('admin:room').emit('driver:statusChanged', { userId: user._id, status, timestamp: new Date() });
      } catch (e) { console.error('[Socket:statusChange]', e.message); }
    });

    socket.on('ping', () => socket.emit('pong', { timestamp: new Date() }));

    // ── Disconnect ────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      socketRateLimit.delete(socket.id);
      if (user.role === 'driver' && reason !== 'client namespace disconnect') {
        await DriverProfile.findOneAndUpdate(
          { userId: user._id, status: 'available' },
          { status: 'offline' }
        ).catch(() => {});
      }
    });
  });
};
