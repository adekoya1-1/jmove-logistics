/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  JMove Logistics — Controlled Database Reset Script
 *
 *  PURPOSE:
 *    Wipes all transactional / test data from MongoDB and re-seeds the
 *    essential configuration collections so the platform is in a clean,
 *    production-ready state.
 *
 *  SAFETY LAYERS (all three must pass before any data is touched):
 *    1. RESET_DB=true must be set in the environment (or passed inline)
 *    2. Interactive prompt — must type the word  CONFIRM  exactly
 *    3. Automatic JSON backup of every collection written before deletion
 *
 *  HOW TO RUN (from the /server directory):
 *    RESET_DB=true node utils/resetDb.js
 *
 *    On Windows (PowerShell):
 *    $env:RESET_DB="true"; node utils/resetDb.js
 *
 *    Optionally skip the interactive prompt (CI use only, use with care):
 *    RESET_DB=true SKIP_CONFIRM=true node utils/resetDb.js
 *
 *  WHAT GETS CLEARED:
 *    users · driverprofiles · orders · payments · trackingevents
 *    notifications · reviews · driverearnings · otptokens · vehicles
 *    auditlogs · savedaddresses · supporttickets · deliveryroutes
 *
 *  WHAT GETS RE-SEEDED:
 *    states · trucktypes · pricingconfigs · systemsettings · super admin
 *
 *  BACKUPS:
 *    Written to  server/backups/reset_<timestamp>/  as JSON files
 *    before any deletion occurs.
 *
 *  RENDER / PRODUCTION NOTES:
 *    This script is intentionally NOT imported or called anywhere in the
 *    main server startup. It only runs when explicitly invoked.
 *    Never add it to Render's start command.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import fs                 from 'fs';
import readline           from 'readline';
import dotenv             from 'dotenv';

// ── Bootstrap env before any other import ───────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

// ── Now import DB models (needs env loaded first) ────────────────────────────
import connectDB, {
  User, DriverProfile, Order, Payment, TrackingEvent,
  Notification, Review, DriverEarning, OtpToken, State,
  TruckType, Vehicle, SystemSetting, AuditLog, SavedAddress,
  SupportTicket, PricingConfig, DeliveryRoute,
} from '../db.js';

import { ensureSuperAdmin }  from './ensureSuperAdmin.js';
import { STATE_DIRECTIONS }  from './pricing.js';
import { DEFAULT_SETTINGS }  from '../routes/settings.js';

// ════════════════════════════════════════════════════════════════════════════
//  COLLECTION MANIFEST
// ════════════════════════════════════════════════════════════════════════════

/**
 * TRANSACTIONAL — cleared completely. Contains test/live user-generated data.
 * After reset these collections start empty; real data accumulates naturally.
 */
const CLEAR_COLLECTIONS = [
  { name: 'users',           model: User,          label: 'Users (all)' },
  { name: 'driverprofiles',  model: DriverProfile, label: 'Driver Profiles' },
  { name: 'orders',          model: Order,         label: 'Orders' },
  { name: 'payments',        model: Payment,       label: 'Payments' },
  { name: 'trackingevents',  model: TrackingEvent, label: 'Tracking Events' },
  { name: 'notifications',   model: Notification,  label: 'Notifications' },
  { name: 'reviews',         model: Review,        label: 'Reviews' },
  { name: 'driverearnings',  model: DriverEarning, label: 'Driver Earnings' },
  { name: 'otptokens',       model: OtpToken,      label: 'OTP Tokens' },
  { name: 'vehicles',        model: Vehicle,       label: 'Vehicles (Fleet)' },
  { name: 'auditlogs',       model: AuditLog,      label: 'Audit Logs' },
  { name: 'savedaddresses',  model: SavedAddress,  label: 'Saved Addresses' },
  { name: 'supporttickets',  model: SupportTicket, label: 'Support Tickets' },
  { name: 'deliveryroutes',  model: DeliveryRoute, label: 'Delivery Routes' },
];

/**
 * CONFIGURATION — cleared then immediately re-seeded with production defaults.
 * Never left empty; always contain valid business logic data.
 */
const RESEED_COLLECTIONS = [
  { name: 'states',         model: State,         label: 'States (Nigerian directory)' },
  { name: 'trucktypes',     model: TruckType,     label: 'Truck Types' },
  { name: 'pricingconfigs', model: PricingConfig, label: 'Pricing Config' },
  { name: 'systemsettings', model: SystemSetting, label: 'System Settings' },
];

// ════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════════════════

const hr  = (char = '─', n = 60) => char.repeat(n);
const log = (msg) => console.log(msg);
const ok  = (msg) => console.log(`  ✅  ${msg}`);
const warn = (msg) => console.warn(`  ⚠️   ${msg}`);
const err  = (msg) => console.error(`  ❌  ${msg}`);
const pad  = (s, n = 28) => String(s).padEnd(n);

/** Format a JS Date to a filesystem-safe string: 2024-03-18_14-05-32 */
const fmtTimestamp = (d = new Date()) =>
  d.toISOString().replace('T', '_').replace(/:/g, '-').slice(0, 19);

/** Ask the user a yes/no question via stdin. Returns a Promise<string>. */
const prompt = (question) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
});

// ════════════════════════════════════════════════════════════════════════════
//  BACKUP STEP
// ════════════════════════════════════════════════════════════════════════════

/**
 * Exports every collection (clear + reseed) to JSON files in a timestamped
 * backup folder under  server/backups/reset_<timestamp>/.
 *
 * Returns the path of the backup directory (for logging).
 */
async function backupCollections(timestamp) {
  const backupDir = join(__dirname, '../backups', `reset_${timestamp}`);

  fs.mkdirSync(backupDir, { recursive: true });

  const all = [...CLEAR_COLLECTIONS, ...RESEED_COLLECTIONS];
  let totalDocs = 0;

  for (const col of all) {
    try {
      const docs = await col.model.find({}).lean();
      const filePath = join(backupDir, `${col.name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf8');
      log(`  💾  ${pad(col.label)} → ${col.name}.json  (${docs.length} docs)`);
      totalDocs += docs.length;
    } catch (e) {
      warn(`Could not back up "${col.name}": ${e.message}`);
    }
  }

  // Write a manifest for easy reference
  const manifest = {
    createdAt:  new Date().toISOString(),
    backupDir,
    collections: all.map(c => c.name),
    totalDocuments: totalDocs,
  };
  fs.writeFileSync(join(backupDir, '_manifest.json'), JSON.stringify(manifest, null, 2));

  return { backupDir, totalDocs };
}

// ════════════════════════════════════════════════════════════════════════════
//  CLEAR STEP
// ════════════════════════════════════════════════════════════════════════════

async function clearCollections() {
  const results = [];

  for (const col of CLEAR_COLLECTIONS) {
    try {
      const { deletedCount } = await col.model.deleteMany({});
      ok(`${pad(col.label)} cleared  (${deletedCount} removed)`);
      results.push({ name: col.name, removed: deletedCount, ok: true });
    } catch (e) {
      err(`Failed to clear "${col.name}": ${e.message}`);
      results.push({ name: col.name, removed: 0, ok: false, error: e.message });
    }
  }

  return results;
}

// ════════════════════════════════════════════════════════════════════════════
//  RE-SEED STEP
// ════════════════════════════════════════════════════════════════════════════

async function reseedStates() {
  await State.deleteMany({});
  const stateDocs = Object.values(STATE_DIRECTIONS).map(v => ({
    name:      v.name,
    direction: v.direction,
    isActive:  true,
  }));
  const inserted = await State.insertMany(stateDocs);
  ok(`${pad('States')} re-seeded  (${inserted.length} states)`);
  return inserted;
}

async function reseedTruckTypes() {
  await TruckType.deleteMany({});
  const DEFAULT_TRUCKS = [
    { name: 'Small Van',    description: 'Up to 1 ton — parcels, documents, electronics',     capacityTons: 1,  icon: '🚐', sortOrder: 0, isActive: true },
    { name: '2-Ton Truck',  description: 'Furniture, appliances, medium commercial goods',     capacityTons: 2,  icon: '🚛', sortOrder: 1, isActive: true },
    { name: '5-Ton Truck',  description: 'Large commercial loads, full house or office moves', capacityTons: 5,  icon: '🚚', sortOrder: 2, isActive: true },
    { name: '10-Ton Truck', description: 'Heavy industrial goods and bulk freight',            capacityTons: 10, icon: '🏗️', sortOrder: 3, isActive: true },
  ];
  const inserted = await TruckType.insertMany(DEFAULT_TRUCKS);
  ok(`${pad('Truck Types')} re-seeded  (${inserted.length} types)`);
  return inserted;
}

async function reseedPricingConfig(truckTypes) {
  await PricingConfig.deleteMany({});

  const baseFees = truckTypes.map(tt => ({
    truckTypeId: tt._id,
    amount:      Math.max(5000, Math.round(tt.capacityTons * 3000)),
  }));

  await PricingConfig.create({
    baseFees,
    distanceBands: [
      { minKm: 0,   maxKm: 30,  ratePerKm: 200, billedMinKm: 30 },
      { minKm: 31,  maxKm: 100, ratePerKm: 150, billedMinKm: 0  },
      { minKm: 101, maxKm: 300, ratePerKm: 120, billedMinKm: 0  },
      { minKm: 301, maxKm: 700, ratePerKm: 100, billedMinKm: 0  },
      { minKm: 701, maxKm: null,ratePerKm: 90,  billedMinKm: 0  },
    ],
    routeMultipliers: [
      { fromZone: 'South West',    toZone: 'South West',    multiplier: 1.0  },
      { fromZone: 'South East',    toZone: 'South East',    multiplier: 1.0  },
      { fromZone: 'South South',   toZone: 'South South',   multiplier: 1.0  },
      { fromZone: 'North Central', toZone: 'North Central', multiplier: 1.0  },
      { fromZone: 'North West',    toZone: 'North West',    multiplier: 1.0  },
      { fromZone: 'North East',    toZone: 'North East',    multiplier: 1.0  },
      { fromZone: 'South West',    toZone: 'South East',    multiplier: 1.1  },
      { fromZone: 'South East',    toZone: 'South West',    multiplier: 1.1  },
      { fromZone: 'South West',    toZone: 'South South',   multiplier: 1.15 },
      { fromZone: 'South South',   toZone: 'South West',    multiplier: 1.15 },
      { fromZone: 'South East',    toZone: 'South South',   multiplier: 1.1  },
      { fromZone: 'South South',   toZone: 'South East',    multiplier: 1.1  },
      { fromZone: 'North Central', toZone: 'South West',    multiplier: 1.2  },
      { fromZone: 'South West',    toZone: 'North Central', multiplier: 1.2  },
      { fromZone: 'North Central', toZone: 'South East',    multiplier: 1.2  },
      { fromZone: 'South East',    toZone: 'North Central', multiplier: 1.2  },
      { fromZone: 'North Central', toZone: 'South South',   multiplier: 1.2  },
      { fromZone: 'South South',   toZone: 'North Central', multiplier: 1.2  },
      { fromZone: 'North West',    toZone: 'South West',    multiplier: 1.35 },
      { fromZone: 'South West',    toZone: 'North West',    multiplier: 1.35 },
      { fromZone: 'North West',    toZone: 'North Central', multiplier: 1.1  },
      { fromZone: 'North Central', toZone: 'North West',    multiplier: 1.1  },
      { fromZone: 'North West',    toZone: 'North East',    multiplier: 1.1  },
      { fromZone: 'North East',    toZone: 'North West',    multiplier: 1.1  },
      { fromZone: 'North East',    toZone: 'South East',    multiplier: 1.4  },
      { fromZone: 'South East',    toZone: 'North East',    multiplier: 1.4  },
      { fromZone: 'North East',    toZone: 'South South',   multiplier: 1.4  },
      { fromZone: 'South South',   toZone: 'North East',    multiplier: 1.4  },
      { fromZone: 'North West',    toZone: 'South South',   multiplier: 1.5  },
      { fromZone: 'South South',   toZone: 'North West',    multiplier: 1.5  },
      { fromZone: 'North West',    toZone: 'South East',    multiplier: 1.45 },
      { fromZone: 'South East',    toZone: 'North West',    multiplier: 1.45 },
      { fromZone: 'North East',    toZone: 'North Central', multiplier: 1.15 },
      { fromZone: 'North Central', toZone: 'North East',    multiplier: 1.15 },
      { fromZone: 'North East',    toZone: 'South West',    multiplier: 1.45 },
      { fromZone: 'South West',    toZone: 'North East',    multiplier: 1.45 },
    ],
    deliveryFees:  { doorDelivery: 1500, depotPickup: 0 },
    optionalFees:  { fragilePercent: 10, insurancePercent: 1, expressFee: 2000, samedayFee: 3000 },
    minimumCharge: 5000,
  });

  ok(`${pad('Pricing Config')} re-seeded  (1 document)`);
}

async function reseedSystemSettings() {
  await SystemSetting.deleteMany({});
  await SystemSetting.insertMany(DEFAULT_SETTINGS);
  ok(`${pad('System Settings')} re-seeded  (${DEFAULT_SETTINGS.length} settings)`);
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  const timestamp = fmtTimestamp();

  log('');
  log(hr('═'));
  log('  🗄️   JMove Logistics — Database Reset');
  log(hr('═'));
  log('');

  // ── SAFETY CHECK 1: environment flag ─────────────────────────────────────
  if (process.env.RESET_DB !== 'true') {
    err('RESET_DB environment variable is not set to "true".');
    log('');
    log('  To run this script, use one of:');
    log('    Linux/macOS:  RESET_DB=true node utils/resetDb.js');
    log('    Windows PS:   $env:RESET_DB="true"; node utils/resetDb.js');
    log('');
    process.exit(1);
  }

  // ── Production warning ───────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    log('');
    warn('NODE_ENV is set to "production".');
    warn('You are about to reset a LIVE production database.');
    warn('This action is IRREVERSIBLE (except from the backup created below).');
    log('');
  }

  // ── Show what will happen ────────────────────────────────────────────────
  log('  Collections that will be CLEARED:');
  CLEAR_COLLECTIONS.forEach(c => log(`    • ${c.label}`));
  log('');
  log('  Collections that will be CLEARED + RE-SEEDED:');
  RESEED_COLLECTIONS.forEach(c => log(`    • ${c.label}`));
  log('');
  log('  After reset, ensureSuperAdmin() will run to restore the admin account.');
  log('');

  // ── SAFETY CHECK 2: interactive confirmation ──────────────────────────────
  const skipConfirm = process.env.SKIP_CONFIRM === 'true';
  if (!skipConfirm) {
    log(hr());
    const answer = await prompt('  Type  CONFIRM  (uppercase) to proceed, or anything else to abort: ');
    log('');

    if (answer !== 'CONFIRM') {
      warn('Reset aborted. No data was modified.');
      log('');
      process.exit(0);
    }
  } else {
    warn('SKIP_CONFIRM=true — skipping interactive prompt.');
  }

  // ── Connect to MongoDB ────────────────────────────────────────────────────
  log(hr());
  log('  📡  Connecting to MongoDB...');
  await connectDB();
  log('');

  // ── BACKUP ────────────────────────────────────────────────────────────────
  log(hr());
  log(`  💾  Creating backup  →  backups/reset_${timestamp}/`);
  log('');
  const { backupDir, totalDocs } = await backupCollections(timestamp);
  log('');
  ok(`Backup complete — ${totalDocs} total documents saved to:`);
  log(`     ${backupDir}`);
  log('');

  // ── CLEAR ─────────────────────────────────────────────────────────────────
  log(hr());
  log('  🗑️   Clearing collections...');
  log('');
  const clearResults = await clearCollections();
  log('');

  // ── RE-SEED ───────────────────────────────────────────────────────────────
  log(hr());
  log('  🌱  Re-seeding configuration collections...');
  log('');

  try {
    const insertedStates = await reseedStates();
    const insertedTrucks = await reseedTruckTypes();
    await reseedPricingConfig(insertedTrucks);
    await reseedSystemSettings();
    log('');
  } catch (e) {
    err(`Re-seed failed: ${e.message}`);
    log('');
    log('  The database has been cleared but re-seeding did not complete.');
    log('  Run  POST /api/pricing/admin/seed-defaults  and  POST /api/settings/seed');
    log('  from the admin panel to restore configuration data manually.');
    log('');
  }

  // ── SUPER ADMIN ───────────────────────────────────────────────────────────
  log(hr());
  log('  👤  Restoring super admin account...');
  log('');
  await ensureSuperAdmin();
  log('');

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  log(hr('═'));
  log('  ✅  Database Reset Complete');
  log(hr('═'));
  log('');

  const totalRemoved = clearResults.reduce((sum, r) => sum + r.removed, 0);
  const failed       = clearResults.filter(r => !r.ok);

  log(`  Documents removed : ${totalRemoved}`);
  log(`  Collections reset : ${clearResults.length}`);
  log(`  Re-seeded         : ${RESEED_COLLECTIONS.length} config collections + super admin`);
  log(`  Backup location   : ${backupDir}`);

  if (failed.length > 0) {
    log('');
    warn(`${failed.length} collection(s) failed to clear:`);
    failed.forEach(f => warn(`  ${f.name}: ${f.error}`));
  }

  log('');
  log('  Next steps:');
  log('  1. Verify the admin panel is accessible');
  log('  2. Check /api/health returns 200');
  log('  3. Log in with SUPER_ADMIN_EMAIL credentials');
  log('  4. Confirm States, Truck Types, and Pricing config look correct');
  log('');

  process.exit(0);
}

main().catch((e) => {
  console.error('\n  ❌  Unhandled error during reset:', e.message);
  console.error(e);
  process.exit(1);
});
