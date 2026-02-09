# Database migrations and deploys

## If staff/roster is missing right now (quick fix)

Run the latest migration(s) on Neon so the app can read staff again. In Neon’s SQL editor, run the contents of:

- `prisma/migrations/20260210120000_add_staff_first_last_name/migration.sql` (if you haven’t already)
- `prisma/migrations/20260210140000_add_staff_sort_order/migration.sql`

Then reload the app; the staff table and roster should be back.

---

## Why the staff/roster sometimes disappears

The app uses Prisma and expects the database to have every column defined in the schema. When we add a new feature (e.g. first/last name, sort order), we add a new **migration**. If that migration is not applied to your **production** database (e.g. Neon), the next deploy uses code that expects the new columns, but they don’t exist yet. The staff query then fails and the roster shows “No staff found.”

## What we changed so this stops happening

- **Build step:** Every Vercel deploy now runs `prisma migrate deploy` before building. That applies any **pending** migrations to the database pointed to by `DATABASE_URL`, so the schema and code stay in sync.

## One-time setup for an existing Neon database

If your Neon database was created or updated by running SQL by hand (instead of `prisma migrate deploy`), Prisma doesn’t know which migrations are already applied. The first time the new build runs, it may try to apply old migrations and fail.

Do this **once** with `DATABASE_URL` set to your Neon connection string (e.g. in `.env`):

1. **Option A – Let Prisma apply only the latest migrations**  
   From the project root run:
   ```bash
   npx prisma migrate deploy
   ```
   If that fails (e.g. “relation already exists”), use Option B.

2. **Option B – Mark already-applied migrations as applied**  
   So Prisma skips them and only runs new ones. Run this for **each** migration that is already applied on Neon (folder names under `prisma/migrations/`), for example:
   ```bash
   npx prisma migrate resolve --applied 20260209120000_add_roster_models
   npx prisma migrate resolve --applied 20260209123000_add_staff_roles
   npx prisma migrate resolve --applied 20260209124500_add_staff_financial_fields
   npx prisma migrate resolve --applied 20260210120000_add_staff_first_last_name
   npx prisma migrate resolve --applied 20260210140000_add_staff_sort_order
   ```
   Add or remove migration names to match what you’ve already run manually. After that, future deploys will only run migrations that are not yet marked as applied.

## After the one-time setup

- Pushing code that includes new migrations will deploy to Vercel; the build runs `prisma migrate deploy`, so those migrations are applied to Neon and the staff table (and roster) keep working.
