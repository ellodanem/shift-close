-- PostgreSQL migration: add system_massy_coupons and count_massy_coupons to shift_close
ALTER TABLE "shift_close"
ADD COLUMN IF NOT EXISTS "system_massy_coupons" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "count_massy_coupons" DOUBLE PRECISION NOT NULL DEFAULT 0;
