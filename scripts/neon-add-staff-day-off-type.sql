-- Add type column to staff_day_off (day_off | sick_leave)
-- Run in Neon SQL Editor

ALTER TABLE "staff_day_off" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'day_off';
