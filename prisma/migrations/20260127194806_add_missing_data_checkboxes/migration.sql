-- PostgreSQL migration: add missing data checkboxes to shift_close
ALTER TABLE "shift_close"
ADD COLUMN IF NOT EXISTS "has_missing_hard_copy_data" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "missing_data_notes" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "over_short_explained" BOOLEAN NOT NULL DEFAULT false;

