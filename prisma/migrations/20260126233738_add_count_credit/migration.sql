-- PostgreSQL migration: add count_credit to shift_close
ALTER TABLE "shift_close"
ADD COLUMN IF NOT EXISTS "count_credit" DOUBLE PRECISION NOT NULL DEFAULT 0;
