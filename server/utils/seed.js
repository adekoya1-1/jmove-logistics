import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

import bcrypt from 'bcryptjs';
import connectDB, { User, DriverProfile } from '../db.js';

// ── Safety guard ─────────────────────────────────────────────────────────────
// This script creates test accounts and MUST NEVER run in production.
// It is purely a development convenience tool for seeding a local / staging DB.
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  console.error('❌  seed.js must not run in production. Aborting.');
  process.exit(1);
}

async function seed() {
  await connectDB();
  console.log('🌱 Seeding JMove Logistics database...\n');

  const hashPw = pw => bcrypt.hash(pw, 12);

  const users = [
    {
      email:         'admin@jmovelogistics.com',
      password:      await hashPw('Admin@123'),
      firstName:     'JMove',
      lastName:      'Admin',
      role:          'admin',
      isActive:      true,
      emailVerified: true,
      // ── New security fields ──
      staffCategory: 'super_admin',
      permissions:   ['orders','drivers','payments','analytics','map','staff'],
      tokenVersion:  0,
      loginAttempts: 0,
      lockUntil:     null,
    },
    {
      email:         'customer@jmovelogistics.com',
      password:      await hashPw('Customer@123'),
      firstName:     'John',
      lastName:      'Doe',
      phone:         '+2348012345678',
      role:          'customer',
      isActive:      true,
      emailVerified: true,
      tokenVersion:  0,
      loginAttempts: 0,
      lockUntil:     null,
    },
    {
      email:         'driver@jmovelogistics.com',
      password:      await hashPw('Driver@123'),
      firstName:     'James',
      lastName:      'Okafor',
      phone:         '+2348098765432',
      role:          'driver',
      isActive:      true,
      emailVerified: true,
      tokenVersion:  0,
      loginAttempts: 0,
      lockUntil:     null,
    },
  ];

  for (const userData of users) {
    const existing = await User.findOne({ email: userData.email });
    if (existing) {
      await DriverProfile.deleteOne({ userId: existing._id });
      await User.deleteOne({ _id: existing._id });
      console.log(`  ♻  Replaced existing: ${userData.email}`);
    }

    const user = new User(userData);
    await user.save();
    console.log(`  ✅ Created: ${userData.email} (${userData.role})`);

    if (userData.role === 'driver') {
      await new DriverProfile({
        userId:       user._id,
        vehicleType:  'van',
        vehiclePlate: 'LAS-123AB',
        vehicleModel: 'Toyota HiAce',
        licenseNumber:'DRV-2024-001',
        employeeId:   'EMP-001',
        status:       'available',
        currentLat:   6.5244,
        currentLng:   3.3792,
        isVerified:   true,
      }).save();
      console.log(`  🚗 Driver profile created`);
    }
  }

  console.log('\n✅ Seed complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔑 Login Credentials:');
  console.log('');
  console.log('   Admin    →  admin@jmovelogistics.com');
  console.log('             Password: Admin@123');
  console.log('');
  console.log('   Customer →  customer@jmovelogistics.com');
  console.log('             Password: Customer@123');
  console.log('');
  console.log('   Driver   →  driver@jmovelogistics.com');
  console.log('             Password: Driver@123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  process.exit(0);
}

seed().catch(e => {
  console.error('❌ Seed failed:', e.message);
  process.exit(1);
});
