-- PostgreSQL migration: add count_inhouse and count_fleet to shift_close
ALTER TABLE "shift_close"
ADD COLUMN IF NOT EXISTS "count_inhouse" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "shift_close"
ADD COLUMN IF NOT EXISTS "count_fleet" DOUBLE PRECISION NOT NULL DEFAULT 0;
