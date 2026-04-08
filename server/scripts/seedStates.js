import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

import { State } from '../db.js';
import { getCityList } from '../utils/pricing.js';

const seedStates = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB.');

    console.log('Fetching state mapping...');
    const statesData = getCityList();
    
    console.log(`Found ${statesData.length} states to seed.`);

    let inserted = 0;
    let updated = 0;

    for (const data of statesData) {
      const existing = await State.findOne({ name: data.name });
      if (existing) {
        existing.direction = data.direction;
        existing.isActive = existing.isActive !== undefined ? existing.isActive : true; // keep existing toggle if any
        await existing.save();
        updated++;
      } else {
        await State.create({
          name: data.name,
          direction: data.direction,
          isActive: true
        });
        inserted++;
      }
    }

    console.log(`\n✅ Seeding complete!`);
    console.log(`- Inserted new states: ${inserted}`);
    console.log(`- Updated existing:    ${updated}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding states:', error);
    process.exit(1);
  }
};

seedStates();
