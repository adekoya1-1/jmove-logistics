import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });
import bcrypt from 'bcryptjs';
import connectDB, { User, DriverProfile } from '../db.js';

async function seed() {
  await connectDB();
  console.log('🌱 Seeding database...');

  const hash = pw => bcrypt.hash(pw, 12);

  // Admin
  await User.findOneAndUpdate(
    { email: 'admin@jmovelogistics.com' },
    { email: 'admin@jmovelogistics.com', password: await hash('Admin@123'), firstName: 'JMove', lastName: 'Admin', role: 'admin', isActive: true, emailVerified: true, refreshToken: null },
    { upsert: true, new: true }
  );

  // Customer
  await User.findOneAndUpdate(
    { email: 'customer@jmovelogistics.com' },
    { email: 'customer@jmovelogistics.com', password: await hash('Customer@123'), firstName: 'John', lastName: 'Doe', phone: '+2348012345678', role: 'customer', isActive: true, emailVerified: true, refreshToken: null },
    { upsert: true, new: true }
  );

  // Driver
  const driver = await User.findOneAndUpdate(
    { email: 'driver@jmovelogistics.com' },
    { email: 'driver@jmovelogistics.com', password: await hash('Driver@123'), firstName: 'James', lastName: 'Swift', phone: '+2348098765432', role: 'driver', isActive: true, emailVerified: true, refreshToken: null },
    { upsert: true, new: true }
  );

  await DriverProfile.findOneAndUpdate(
    { userId: driver._id },
    { userId: driver._id, vehicleType: 'van', vehiclePlate: 'LAS-123AB', vehicleModel: 'Toyota HiAce', licenseNumber: 'DRV-2024-001', employeeId: 'EMP-001', status: 'available', currentLat: 6.5244, currentLng: 3.3792, isVerified: true },
    { upsert: true, new: true }
  );

  console.log('✅ Seed done!');
  console.log('');
  console.log('🔑 Credentials:');
  console.log('   Admin    → admin@jmovelogistics.com    / Admin@123');
  console.log('   Customer → customer@jmovelogistics.com / Customer@123');
  console.log('   Driver   → driver@jmovelogistics.com   / Driver@123');
  console.log('');
  console.log('📦 Business Model: GIG Logistics style');
  console.log('   - Zone-based pricing (intrastate / interstate)');
  console.log('   - Waybill numbers (JMV-LAG-YYYYMMDD-XXXX)');
  console.log('   - Service types: standard / express / sameday');
  console.log('   - Payment: online, cash at centre, cash on delivery');
  console.log('   - Public waybill tracking (no login needed)');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
