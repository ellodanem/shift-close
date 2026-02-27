-- Run this in Neon SQL Editor to add recurrence columns to reminders.
-- Safe to run more than once (uses IF NOT EXISTS where supported).

ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "recurrence_type" TEXT;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "recurrence_day_of_week" INTEGER;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "recurrence_day_of_month" INTEGER;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "recurrence_end_date" TEXT;
