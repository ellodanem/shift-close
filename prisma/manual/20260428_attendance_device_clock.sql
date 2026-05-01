-- Learned device clock + punch audit columns (PostgreSQL).
-- Apply on your database if `prisma migrate dev` is not used for this repo.

ALTER TABLE "attendance_logs"
  ADD COLUMN IF NOT EXISTS "device_raw_timestamp" TEXT,
  ADD COLUMN IF NOT EXISTS "device_serial" TEXT,
  ADD COLUMN IF NOT EXISTS "ingest_received_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "clock_offset_ms_applied" INTEGER,
  ADD COLUMN IF NOT EXISTS "clock_normalize_reason" TEXT;

CREATE INDEX IF NOT EXISTS "attendance_logs_device_serial_idx" ON "attendance_logs" ("device_serial");

CREATE TABLE IF NOT EXISTS "attendance_device_clocks" (
  "device_serial" TEXT NOT NULL,
  "offset_ms" INTEGER NOT NULL DEFAULT 0,
  "is_calibrated" BOOLEAN NOT NULL DEFAULT false,
  "pending_deltas_json" TEXT NOT NULL DEFAULT '[]',
  "calibration_samples" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_device_clocks_pkey" PRIMARY KEY ("device_serial")
);
