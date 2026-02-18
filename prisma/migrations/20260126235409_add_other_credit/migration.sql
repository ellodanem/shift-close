-- PostgreSQL migration: add other_credit to shift_close
ALTER TABLE "shift_close"
ADD COLUMN IF NOT EXISTS "other_credit" DOUBLE PRECISION NOT NULL DEFAULT 0;

