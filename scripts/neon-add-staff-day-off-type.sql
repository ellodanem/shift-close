-- Add type and end_date columns to staff_day_off
-- Run in Neon SQL Editor

ALTER TABLE "staff_day_off" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'day_off';
ALTER TABLE "staff_day_off" ADD COLUMN IF NOT EXISTS "end_date" TEXT;
