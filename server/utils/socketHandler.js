import jwt from 'jsonwebtoken';
import { User, DriverProfile, TrackingEvent } from '../db.js';
import { randomUUID } from 'crypto';

export default (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await User.findById(decoded.userId).select('firstName lastName role isActive');
      if (!user?.isActive) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch { next(new Error('Invalid token')); }
  });

  io.on('connection', (socket) => {
    const { user } = socket;
    console.log(`🔌 ${user.firstName} (${user.role}) connected`);

    socket.join(`user:${user._id}`);
    if (user.role === 'admin')  socket.join('admin:room');
    if (user.role === 'driver') socket.join('drivers:room');

    // Customer subscribes to track an order
    socket.on('order:subscribe', ({ orderId }) => {
      socket.join(`order:${orderId}`);
      socket.emit('order:subscribed', { orderId });
    });

    socket.on('order:unsubscribe', ({ orderId }) => socket.leave(`order:${orderId}`));

    // Driver pushes GPS
    socket.on('driver:updateLocation', async ({ lat, lng, orderId }) => {
      if (user.role !== 'driver') return;
      try {
        const dp = await DriverProfile.findOne({ userId: user._id });
        if (!dp) return;
        await DriverProfile.findByIdAndUpdate(dp._id, { currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() });
        if (orderId) {
          await TrackingEvent.create({ orderId, driverId: dp._id, lat, lng });
          io.to(`order:${orderId}`).emit('driver:locationUpdate', { lat, lng, orderId, driverId: dp._id, timestamp: new Date() });
        }
        io.to('admin:room').emit('driver:locationUpdate', { lat, lng, orderId, driverId: dp._id, userId: user._id, timestamp: new Date() });
      } catch (e) { console.error('Location update error:', e.message); }
    });

    // Driver changes status
    socket.on('driver:statusChange', async ({ status }) => {
      if (user.role !== 'driver') return;
      try {
        await DriverProfile.findOneAndUpdate({ userId: user._id }, { status });
        io.to('admin:room').emit('driver:statusChanged', { userId: user._id, status, timestamp: new Date() });
      } catch (e) { console.error('Status change error:', e.message); }
    });

    socket.on('ping', () => socket.emit('pong', { timestamp: new Date() }));

    socket.on('disconnect', async (reason) => {
      console.log(`🔌 ${user.firstName} disconnected (${reason})`);
      if (user.role === 'driver' && reason !== 'client namespace disconnect') {
        await DriverProfile.findOneAndUpdate(
          { userId: user._id, status: 'available' },
          { status: 'offline' }
        ).catch(() => {});
      }
    });
  });
};
