-- Run this in the Neon SQL Editor
-- Creates the pay_periods table for attendance pay period reports

CREATE TABLE IF NOT EXISTS "pay_periods" (
    "id"         TEXT      NOT NULL PRIMARY KEY,
    "start_date" TEXT      NOT NULL,
    "end_date"   TEXT      NOT NULL,
    "report_date" TEXT     NOT NULL,
    "entity_name" TEXT     NOT NULL DEFAULT 'Total Auto Service Station',
    "rows"       TEXT      NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "pay_periods_start_date_end_date_idx" ON "pay_periods"("start_date", "end_date");
