# Aapka PG: PG / Hostel management app

Full-stack code for the 10-screen blueprint: tenant, manager and owner (malik) in one app.

- **frontend/**: React + Vite (mobile-first PWA-style UI). Deploy on Vercel.
- **backend/**: Node.js + Express + MongoDB (Mongoose). Deploy on Azure App Service / Render.
- **Database**: MongoDB Atlas (free tier is fine).

## Screens → where they live

| # | Screen | Role | Frontend | API |
|---|---|---|---|---|
| 1 | Online Kiraya | Tenant | `pages/Tenant.jsx` `Rent` | `/api/tenant/dashboard`, `/pay/order`, `/pay/confirm`, `/receipt/:no` |
| 2 | Bijli ka Bill | Tenant | `Bill` | `/api/tenant/bill` |
| 3 | Complaint | Tenant | `Complaint` | `/api/tenant/complaints` |
| 4 | Khaane ka Menu | Tenant | `Menu` | `/api/tenant/menu`, `/menu/skip`, `/menu/rate` |
| 5 | Meter Reading | Manager | `pages/Manager.jsx` `Meter` | `/api/manager/rooms`, `/readings`, `/readings/send` |
| 6 | Complaint List | Manager | `Complaints` | `/api/manager/complaints` |
| 7 | Naya Tenant | Manager | `Tenants` | `/api/manager/tenants`, `/beds/vacant` |
| 8 | Kiraya + Deposit Hisaab | Malik | `pages/Owner.jsx` `Hisaab` | `/api/owner/summary`, `/remind`, `/deposits` |
| 9 | Khaali Bed List | Malik | `Beds` + public `/vacancy` page | `/api/owner/beds`, `/api/public/vacancy` |
| 10 | Login | All | `pages/Login.jsx` | `/api/auth/request-otp`, `/verify` |

Extras added because the screens need them: owner Settings (rate per unit, due date), manager Menu editor, tenant checkout / notice.

## Run locally

```bash
# 1. backend
cd backend
cp .env.example .env        # set MONGODB_URI (Atlas URI, or local mongod)
npm install
npm run seed                # demo data. Use `npm run seed -- --reset` to wipe and re-seed
npm run dev                 # http://localhost:4000

# 2. frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

Demo logins (OTP appears on the login screen and in the backend console while `OTP_DEV_MODE=true`):
malik `9000000001`, manager `9000000002`, tenant `9000000011`.

## Deploy

1. **MongoDB Atlas**: create a free cluster, add a DB user, allow your backend's IP (or 0.0.0.0/0 to start), copy the URI.
2. **Backend** (Azure App Service or Render): root `backend/`, start command `npm start`. Environment variables:
   `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET` (long random), `CLIENT_ORIGIN` (your Vercel URL, comma separated if several),
   `OTP_LENGTH`, and the payment keys. Run `npm run seed` once (or create your malik user manually) to get the first logins.
3. **Frontend** (Vercel): root `frontend/`, build `npm run build`, output `dist`. Set `VITE_API_URL=https://<your-backend>/api`. `vercel.json` already handles SPA routing.

## Before real tenants use it

These are stubbed on purpose; each is one small file to swap.

1. **OTP SMS**: `backend/src/notify.js → sendOtpSms`. Plug in MSG91 / Fast2SMS / Twilio. Until then login only works in dev mode, because production never returns the OTP.
2. **WhatsApp** (receipts, reminders, bills): `notify.js → sendWhatsApp`. Needs WhatsApp Business API templates approved by Meta (or a provider such as Gupshup / Interakt).
3. **Payments**: set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Orders are created on the server and the payment signature is verified before anything is marked paid. Without keys the app uses mock payments, only when `ALLOW_MOCK_PAYMENTS=true`. Set it to `false` in production. Razorpay charges a fee per transaction.
4. **File storage**: uploads (ID proofs, photos, meter photos) go to local disk (`UPLOAD_DIR`). Render's free tier wipes disk on redeploy; Azure App Service keeps `/home`. For production move to Azure Blob / S3 by replacing `backend/src/upload.js` and the `/api/files` route. Files are served only to logged-in users and have random names. Add a retention and privacy policy, since ID and police verification documents are sensitive.
5. **Logout and tokens**: the JWT lasts 30 days and sits in `localStorage`. Shorten it or move to httpOnly cookies if you want stricter security.

## How the money logic works

- Each month, a rent entry (`rent + food`) is created for every active tenant on first access (idempotent) with the due date from Settings.
- Electricity for readings of month **M** is split equally among the room's current tenants (leftover rupees go to the first tenants so shares always add up) and added to the rent of month **M+1**. If that rent is already paid or in checkout, a separate electricity entry is created.
- "Late" means the due date has passed and the entry is still unpaid. Reminders go out at most once a day unless the owner taps one person.
- A tenant who leaves frees the bed (`vacantSince` starts counting days vacant). Deposit refund is **not** handled in the app.

## Not included yet (from the blueprint's "optional" list)

UPI AutoPay, multiple PGs / branches, smart meter, Hindi/English toggle, digital agreement, downloadable monthly report, rating after complaint. The data model has room for them (add a `pg` field to each collection for multi-branch).
