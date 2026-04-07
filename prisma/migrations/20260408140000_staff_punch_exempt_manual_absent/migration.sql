-- Punch-exempt staff (no clock); optional manual absent override for present/absence
ALTER TABLE "staff" ADD COLUMN "punch_exempt" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "attendance_day_overrides" ADD COLUMN "manual_absent" BOOLEAN NOT NULL DEFAULT false;
