import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });
import { State } from '../db.js';

const check = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const count = await State.countDocuments();
    console.log('Total populated states in DB:', count);
    process.exit(0);
};
check();
