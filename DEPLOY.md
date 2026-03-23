# 🚀 JMove Logistics — Deployment Guide

## Overview

| Part      | Platform        | Cost  | URL Pattern                          |
|-----------|-----------------|-------|--------------------------------------|
| Frontend  | Vercel          | Free  | `https://jmove-logistics.vercel.app` |
| Backend   | Render.com      | Free  | `https://jmove-logistics-api.onrender.com` |
| Database  | MongoDB Atlas   | Free  | Already configured ✅                |

---

## Step 1 — Deploy the Backend to Render.com

### 1a. Push your code to GitHub
1. Create a new repo at https://github.com/new
2. In your project folder, open a terminal:
```bash
git init
git add .
git commit -m "Initial JMove Logistics deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/jmove-logistics.git
git push -u origin main
```

### 1b. Create a Render Web Service
1. Go to https://render.com → Sign up/login
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account and select your repo
4. Configure:
   - **Name:** `jmove-logistics-api`
   - **Root Directory:** `server`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Instance Type:** Free

### 1c. Set Environment Variables on Render
In your Render service → **Environment** tab, add:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `MONGODB_URI` | `mongodb+srv://jmove-databse:8S1EDZil1bTQnlsi@jmove-logistics.tzjqfg1.mongodb.net/jmovelogistics?retryWrites=true&w=majority&appName=jmove-logistics` |
| `JWT_SECRET` | *(generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)* |
| `JWT_REFRESH_SECRET` | *(generate another one)* |
| `JWT_EXPIRES_IN` | `7d` |
| `JWT_REFRESH_EXPIRES_IN` | `30d` |
| `PAYSTACK_SECRET_KEY` | `sk_live_...` *(from Paystack dashboard)* |
| `FRONTEND_URL` | *(set after Step 2 — your Vercel URL)* |
| `EMAIL_FROM` | `noreply@jmovelogistics.com` |

4. Click **Deploy** — wait ~3 minutes
5. Test: visit `https://jmove-logistics-api.onrender.com/api/health`
   You should see: `{"status":"ok","service":"JMove Logistics API",...}`

### 1d. Run the seed on production
Once deployed, go to Render → your service → **Shell** tab:
```bash
node utils/seed.js
```

---

## Step 2 — Deploy the Frontend to Vercel

### 2a. Install Vercel CLI (or use the website)
```bash
npm install -g vercel
```

### 2b. Deploy
In your project root (not the server folder):
```bash
vercel
```
Follow the prompts:
- Set up a new project: **Yes**
- Project name: `jmove-logistics`
- Framework: **Vite** (auto-detected)
- Root directory: `.` (the project root)

### 2c. Set Environment Variables on Vercel
Go to https://vercel.com → your project → **Settings** → **Environment Variables**:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://jmove-logistics-api.onrender.com/api` |
| `VITE_SOCKET_URL` | `https://jmove-logistics-api.onrender.com` |
| `VITE_PAYSTACK_PUBLIC_KEY` | `pk_live_...` *(from Paystack dashboard)* |

Then redeploy:
```bash
vercel --prod
```

### 2d. Update Render FRONTEND_URL
Go back to Render → your service → Environment:
- Update `FRONTEND_URL` to your Vercel URL, e.g. `https://jmove-logistics.vercel.app`
- Render will auto-redeploy

---

## Step 3 — Final Checks

- [ ] Visit your Vercel URL → landing page loads ✓
- [ ] Click "Sign In" → login works ✓
- [ ] Login: `admin@jmovelogistics.com` / `Admin@123`
- [ ] Check `/api/health` → `{"status":"ok"}` ✓
- [ ] Try booking a test order ✓
- [ ] Check Paystack dashboard is in LIVE mode for real payments

---

## Custom Domain (Optional)

### Vercel
1. Vercel dashboard → your project → **Domains**
2. Add your domain e.g. `jmovelogistics.com`
3. Add DNS records at your domain registrar as instructed

### Render
1. Render dashboard → your service → **Settings** → **Custom Domain**
2. Add `api.jmovelogistics.com`
3. Update `VITE_API_URL` on Vercel to `https://api.jmovelogistics.com/api`

---

## Monitoring

- **Render logs:** Dashboard → your service → **Logs**
- **Health check:** `https://jmove-logistics-api.onrender.com/api/health`
- **MongoDB Atlas:** Atlas dashboard → **Monitoring** tab

## ⚠️ Important Notes

1. **Free Render instances spin down after 15 mins of inactivity** — first request after idle takes ~30 seconds. Upgrade to Render Starter ($7/mo) to avoid this.

2. **Never commit `.env` files to git** — they're in `.gitignore` already.

3. **Switch Paystack to LIVE mode** before accepting real payments — update both `PAYSTACK_SECRET_KEY` (Render) and `VITE_PAYSTACK_PUBLIC_KEY` (Vercel).

4. **MongoDB Atlas network access** — ensure `0.0.0.0/0` is in your IP whitelist (Network Access tab) so Render can connect.
