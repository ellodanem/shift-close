-- Run this in the Neon SQL Editor
-- Creates the pay_days table for pay day reminders (when accounting processes payments)

CREATE TABLE IF NOT EXISTS "pay_days" (
    "id"         TEXT      NOT NULL PRIMARY KEY,
    "date"       TEXT      NOT NULL,
    "notes"      TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "pay_days_date_idx" ON "pay_days"("date");
