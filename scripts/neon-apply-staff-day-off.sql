-- Run this in the Neon SQL Editor (project → SQL Editor → paste and run)
-- Creates the staff_day_off table for day-off requests (used by Roster Day Off Request modal)

CREATE TABLE IF NOT EXISTS "staff_day_off" (
    "id"         TEXT      NOT NULL PRIMARY KEY,
    "staff_id"   TEXT      NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE,
    "date"       TEXT      NOT NULL,
    "reason"     TEXT,
    "status"     TEXT      NOT NULL DEFAULT 'approved',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_day_off_staff_date" UNIQUE ("staff_id", "date")
);
