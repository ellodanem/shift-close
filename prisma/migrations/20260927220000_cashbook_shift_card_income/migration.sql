-- Closed-shift credit and debit post to cashbook income.
ALTER TABLE "cashbook_entries" ADD COLUMN "shift_income_kind" TEXT;

CREATE UNIQUE INDEX "cashbook_entries_shift_income_kind"
  ON "cashbook_entries" ("shiftId", "shift_income_kind")
  WHERE "shiftId" IS NOT NULL AND "shift_income_kind" IS NOT NULL;
