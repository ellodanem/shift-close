# Your steps: Postgres on Vercel (after Agent’s changes)

Agent has switched the app to **PostgreSQL** using `DATABASE_URL`. Do the following once.

---

## 1. Create tables in Neon (one-time)

Your Neon database is empty until you apply the schema.

**Option A – From your PC (recommended)**

1. Get your **Neon connection string** from Vercel:
   - Vercel → your **shift-close** project → **Settings** → **Environment Variables**
   - Copy the value of **`DATABASE_URL`** (or **`POSTGRES_PRISMA_URL`** if that’s what you use for Prisma).

2. In your project folder, set it for this terminal session and push the schema:

   **Windows (PowerShell):**
   ```powershell
   $env:DATABASE_URL="paste-your-neon-connection-string-here"
   npx prisma db push
   ```

   **Mac/Linux:**
   ```bash
   export DATABASE_URL="paste-your-neon-connection-string-here"
   npx prisma db push
   ```

   Or create a **`.env`** in the project root (do not commit it if it has secrets):

   ```
   DATABASE_URL="your-neon-connection-string"
   ```

   Then run:

   ```bash
   npx prisma db push
   ```

3. You should see something like: “The database is now in sync with your schema.” Tables (staff, shift_close, payment_batches, etc.) now exist in Neon.

**Option B – From Neon dashboard**

- Neon’s SQL editor doesn’t create tables from Prisma schema. Use **Option A** so `prisma db push` creates everything correctly.

---

## 2. Local development

- Use the **same** Neon `DATABASE_URL` in a local **`.env`** so your app and Prisma use Postgres (and Neon) locally, **or**
- Use a separate Postgres URL in `.env` for local only; keep Neon for Vercel.

Without `DATABASE_URL` in `.env`, Prisma will error (“Environment variable not found: DATABASE_URL”).

---

## 3. Redeploy on Vercel

- Commit and push the Prisma schema change (Postgres + `DATABASE_URL`).
- Vercel will redeploy. Build and runtime will use **Neon** and the tables you created in step 1.

---

## 4. Optional: Blob for uploads

- Agent has **not** yet switched file uploads to Vercel Blob. Right now the app still expects local disk, so uploads on Vercel may not persist. After Postgres is working, we can add Blob so uploads go to `BLOB_READ_WRITE_TOKEN`.

---

## Quick checklist

| Step | What you do |
|------|------------------|
| 1 | Copy `DATABASE_URL` from Vercel → set in terminal or `.env` → run `npx prisma db push` |
| 2 | Add `DATABASE_URL` to local `.env` for dev |
| 3 | Commit, push, let Vercel redeploy |
