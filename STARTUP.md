# ⚡ JMove Logistics — Quick Start Guide

## The "401 Unauthorized" on login means the seed hasn't been run yet.
## The database is empty — you need to create the test users first.

---

## Step 1 — Start the Backend (Terminal 1)

```bash
cd "swifthaul - Copy/server"
npm install
npm run seed      ← RUN THIS FIRST (creates test users)
npm run dev
```

✅ You should see:
```
  🌱 Seeding database...
  ✅ Seed done!
  🔑 Credentials:
     Admin    → admin@jmovelogistics.com    / Admin@123
     Customer → customer@jmovelogistics.com / Customer@123
     Driver   → driver@jmovelogistics.com   / Driver@123

  ⚡ JMove Logistics Server
  🚀 http://localhost:5000
  ✅ MongoDB connected
```

---

## Step 2 — Start the Frontend (Terminal 2)

```bash
cd "swifthaul - Copy"
npm install
npm run dev
```

Open http://localhost:5173 (or 5174 if 5173 is busy)

---

## Login Credentials (after running seed)

| Role     | Email                          | Password      |
|----------|--------------------------------|---------------|
| Admin    | admin@jmovelogistics.com       | Admin@123     |
| Customer | customer@jmovelogistics.com    | Customer@123  |
| Driver   | driver@jmovelogistics.com      | Driver@123    |

---

## ❌ "401 Unauthorized" on login?

**Fix:** The seed hasn't run yet. In Terminal 1 (server folder):
```bash
npm run seed
```
Then try logging in again.

## ❌ MongoDB connection refused?

Your Atlas URI is already set in `server/.env`. Just run the seed.
If you get a connection error, check:
1. Your IP is whitelisted in Atlas → Network Access → Allow 0.0.0.0/0
2. The password in the URI is correct

## ❌ Port 5173 in use?

Vite will automatically use 5174. The proxy still works — just open
whatever URL Vite shows in the terminal output.
