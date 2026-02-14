-- Run this in Neon SQL Editor to add debitCheck and payment_method columns.
-- Safe to run more than once (skips if columns exist).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cashbook_entries' AND column_name = 'debitCheck') THEN
    ALTER TABLE "cashbook_entries" ADD COLUMN "debitCheck" DOUBLE PRECISION NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cashbook_entries' AND column_name = 'payment_method') THEN
    ALTER TABLE "cashbook_entries" ADD COLUMN "payment_method" TEXT;
  END IF;
END $$;
