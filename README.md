# ⚡ SwiftHaul — Full-Stack Logistics Platform

React + Vite frontend with Express + MongoDB backend, matching the TSEDAQAH project structure.

---

## 📁 Structure

```
swifthaul/
├── index.html          ← Vite entry
├── package.json        ← Frontend deps (React, Vite, Socket.io-client, Recharts)
├── vite.config.js      ← Proxies /api → :5000
├── src/
│   ├── main.jsx
│   ├── App.jsx         ← Router + AuthContext
│   ├── index.css       ← Global styles + design tokens
│   ├── api/client.js   ← Fetch-based API client with token refresh
│   ├── components/
│   │   ├── admin/AdminLayout.jsx + .css
│   │   ├── customer/CustomerLayout.jsx + .css
│   │   └── driver/DriverLayout.jsx
│   └── pages/
│       ├── Landing.jsx + .css
│       ├── Login.jsx + .css
│       ├── Register.jsx + .css
│       ├── PaymentVerify.jsx + .css
│       ├── admin/      (Dashboard, Orders, OrderDetail, Drivers, Users, Map, Analytics, Payments)
│       ├── customer/   (Dashboard, Orders, OrderDetail, NewOrder, Payments)
│       └── driver/     (Dashboard, Jobs, Active, History)
│
└── server/
    ├── index.js        ← Express + Socket.io entry
    ├── package.json    ← Express + Mongoose + Socket.io
    ├── db.js           ← All 6 Mongoose models
    ├── middleware/auth.js
    ├── routes/         ← auth, orders, drivers, payments, users, tracking
    └── utils/          ← email, pricing, socketHandler, seed
```

---

## 🚀 Setup

### 1. MongoDB
Start MongoDB locally or use [MongoDB Atlas](https://cloud.mongodb.com).

### 2. Backend
```bash
cd server
cp .env.example .env        # Fill in MONGODB_URI, JWT_SECRET, PAYSTACK keys, etc.
npm install
node utils/seed.js          # Seeds 3 test accounts
npm run dev                 # Starts on :5000
```

### 3. Frontend
```bash
# From project root
cp .env.example .env.local  # Fill in VITE_GOOGLE_MAPS_KEY, VITE_PAYSTACK_PUBLIC_KEY
npm install
npm run dev                 # Starts on :5173 — proxies /api to :5000
```

---

## 🔑 Demo Credentials (after seeding)

| Role     | Email                        | Password       |
|----------|------------------------------|----------------|
| Admin    | admin@swifthaul.com          | Admin@123      |
| Customer | customer@swifthaul.com       | Customer@123   |
| Driver   | driver@swifthaul.com         | Driver@123     |

---

## 🧪 Test the Full Flow

1. **Login as Customer** → Create New Shipment → Pay (Paystack test card: `4084 0840 8408 4081`)
2. **Login as Admin** → Orders → Assign Driver to paid order
3. **Login as Driver** → Active Delivery → Update statuses → GPS auto-shares location
4. **Customer** sees live map update and status changes in real-time

---

## 🌐 Deploy

### Frontend (Vercel)
```bash
npm run build    # outputs dist/
# Push to GitHub, connect on vercel.com
# Set VITE_* env vars in Vercel dashboard
```

### Backend (Render / Railway)
- Root directory: `server/`
- Build command: `npm install`
- Start command: `node index.js`
- Add all env vars from `server/.env.example`

### Google Maps
Enable these APIs in Google Cloud Console:
- Maps JavaScript API
- Places API
- Directions API

### Paystack Webhook
Set: `https://your-api.com/api/payments/webhook`  
Event: `charge.success`

---

## 💰 Pricing

```
Total = ₦500 base + ₦150/km + weight surcharge + fragile (+₦500)
Min: ₦1,500
```

| Weight   | Surcharge |
|----------|-----------|
| 0–2 kg   | Free      |
| 2–5 kg   | ₦200      |
| 5–10 kg  | ₦500      |
| 10–25 kg | ₦1,200    |
| 25–50 kg | ₦2,500    |
| 50 kg+   | ₦5,000    |
