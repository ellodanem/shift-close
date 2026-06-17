-- Run in Neon SQL Editor to track when cashbook check expenses are cleared.
-- Safe to run more than once.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cashbook_entries'
      AND column_name = 'cleared_at'
  ) THEN
    ALTER TABLE "cashbook_entries" ADD COLUMN "cleared_at" TIMESTAMP(3);
  END IF;
END $$;
