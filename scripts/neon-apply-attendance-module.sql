-- Run this in Neon SQL Editor to add attendance module.
-- Additive only. Run once.

-- Add device_user_id to staff
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "device_user_id" TEXT;

-- Create attendance_logs table
CREATE TABLE IF NOT EXISTS "attendance_logs" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT,
    "device_user_id" TEXT NOT NULL,
    "device_user_name" TEXT,
    "punch_time" TIMESTAMP(3) NOT NULL,
    "punch_type" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'zkteco',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "attendance_logs_staff_id_idx" ON "attendance_logs"("staff_id");
CREATE INDEX IF NOT EXISTS "attendance_logs_punch_time_idx" ON "attendance_logs"("punch_time");
CREATE INDEX IF NOT EXISTS "attendance_logs_device_user_id_idx" ON "attendance_logs"("device_user_id");

ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
