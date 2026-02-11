-- Run this in Neon SQL Editor to restore staff/roster when columns are missing.
-- Safe to run more than once (skips columns that already exist).

-- first_name, last_name (if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'first_name') THEN
    ALTER TABLE "staff" ADD COLUMN "first_name" TEXT;
    ALTER TABLE "staff" ADD COLUMN "last_name" TEXT;
    UPDATE "staff" SET "first_name" = TRIM(SPLIT_PART("name", ' ', 1)), "last_name" = TRIM(SUBSTRING("name" FROM POSITION(' ' IN "name") + 1)) WHERE POSITION(' ' IN COALESCE("name", '')) > 0;
    UPDATE "staff" SET "first_name" = COALESCE(TRIM("name"), ''), "last_name" = '' WHERE "first_name" IS NULL;
    ALTER TABLE "staff" ALTER COLUMN "first_name" SET DEFAULT '';
    ALTER TABLE "staff" ALTER COLUMN "last_name" SET DEFAULT '';
    ALTER TABLE "staff" ALTER COLUMN "first_name" SET NOT NULL;
    ALTER TABLE "staff" ALTER COLUMN "last_name" SET NOT NULL;
  END IF;
END $$;

-- sort_order (if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'sort_order') THEN
    ALTER TABLE "staff" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- vacation_start, vacation_end (if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'vacation_start') THEN
    ALTER TABLE "staff" ADD COLUMN "vacation_start" TEXT;
    ALTER TABLE "staff" ADD COLUMN "vacation_end" TEXT;
  END IF;
END $$;

-- mobile_number (for WhatsApp / wa.me roster share)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'mobile_number') THEN
    ALTER TABLE "staff" ADD COLUMN "mobile_number" TEXT;
  END IF;
END $$;
