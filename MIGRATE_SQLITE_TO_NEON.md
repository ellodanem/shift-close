# One-time: Migrate data from SQLite to Neon

This guide runs the migration script that copies data from your local **SQLite** file (`prisma/shiftclose.db`) into your **Neon Postgres** database (used by the live app on Vercel).

The script uses **sql.js** (pure JavaScript, no native build), so it works on Windows without Visual Studio.

---

## Before you run

1. **SQLite file** – You need the existing database file at `prisma/shiftclose.db` (the one you used before switching to Postgres). If you renamed or moved it, put it back at `prisma/shiftclose.db` for the script.
2. **Neon URL** – Your `.env` (or environment) must have `DATABASE_URL` set to your **Neon** connection string (the same one Vercel uses). Get it from Vercel → Project → Settings → Environment Variables → `DATABASE_URL`.
3. **Neon is empty** – The script uses `skipDuplicates: true`, so it's safe to run again if it fails partway; already-inserted rows will be skipped.

---

## 1. Install script dependencies (one-time)

From the project root:

```bash
npm install --save-dev sql.js dotenv
```

No Visual Studio or native build tools required.

---

## 2. Set DATABASE_URL

**Option A – .env (recommended)**  
In the project root, create or edit `.env` and add:

```
DATABASE_URL="postgresql://user:password@host/neondb?sslmode=require"
```

Paste your real Neon connection string (from Vercel env vars). Do **not** commit `.env`.

**Option B – One-off in terminal**  
- **Windows (PowerShell):**  
  `$env:DATABASE_URL="postgresql://..."; node scripts/migrate-sqlite-to-neon.js`  
- **Mac/Linux:**  
  `DATABASE_URL="postgresql://..." node scripts/migrate-sqlite-to-neon.js`

---

## 3. Run the migration

From the project root:

```bash
node scripts/migrate-sqlite-to-neon.js
```

Or use the npm script (after installing deps):

```bash
npm run db:migrate-from-sqlite
```

You should see one line per table (e.g. `staff: 5 rows`, `shift_close: 120 rows`, …) and finally `Migration done.`

---

## 4. Verify

- Open your **live app** on Vercel (or run `npm run dev` with `DATABASE_URL` pointing at Neon) and check Dashboard, Shifts, Fuel Payments, etc. Your data should appear.
- If something is missing, check the script output for errors on a specific table; you can fix and re-run (duplicates will be skipped).

---

## Tables copied (in order)

Staff → StaffDocument → ShiftClose → Corrections → NoteHistory → HistoricalFuelData → Invoices → InvoiceCorrections → PaymentSimulations → Balances → PaymentBatches → PaidInvoices → PaymentCorrections → CustomerArSummary → CustomerArAccountSnapshots.  
After that, the script updates `invoices.paid_invoice_id` where applicable.

---

## Troubleshooting

- **"SQLite file not found"** – Ensure `prisma/shiftclose.db` exists (path is relative to project root).
- **"DATABASE_URL must be set"** – Set it in `.env` or in the shell before running the script.
- **"table X does not exist" in SQLite** – Older SQLite DBs might not have every table; the script skips missing tables.
- **Prisma / Postgres errors** – Ensure Neon has the schema (you already ran `prisma db push`). If you added new columns in Prisma later, run `prisma db push` again against Neon, then re-run this script.
