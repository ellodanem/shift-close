-- PostgreSQL migration: add over_short_explanation and unique (date, shift)

ALTER TABLE "shift_close"
ADD COLUMN IF NOT EXISTS "over_short_explanation" TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS "shift_close_date_shift_key" ON "shift_close"("date", "shift");

