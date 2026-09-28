-- Run in Neon SQL Editor: link cashbook income rows to closed-shift credit and debit.
-- Safe to run more than once.

ALTER TABLE "cashbook_entries" ADD COLUMN IF NOT EXISTS "shift_income_kind" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "cashbook_entries_shift_income_kind"
  ON "cashbook_entries" ("shiftId", "shift_income_kind")
  WHERE "shiftId" IS NOT NULL AND "shift_income_kind" IS NOT NULL;
