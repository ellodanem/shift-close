-- Remove type and end_date from staff_day_off (sick leave now in staff_sick_leave)
-- Run in Neon SQL Editor AFTER running neon-apply-staff-sick-leave.sql
-- Migrate existing sick_leave records first if needed, then run this.

ALTER TABLE "staff_day_off" DROP COLUMN IF EXISTS "type";
ALTER TABLE "staff_day_off" DROP COLUMN IF EXISTS "end_date";
