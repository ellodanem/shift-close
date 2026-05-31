-- Run in Neon SQL Editor: link cashbook entries to shift deposit lines.
-- Safe to run more than once.

ALTER TABLE "cashbook_entries" ADD COLUMN IF NOT EXISTS "deposit_line_index" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "cashbook_entries_shift_deposit_line"
  ON "cashbook_entries" ("shiftId", "deposit_line_index")
  WHERE "shiftId" IS NOT NULL AND "deposit_line_index" IS NOT NULL;
