-- Create staff_sick_leave table (separate from staff_day_off)
-- Run in Neon SQL Editor

CREATE TABLE IF NOT EXISTS "staff_sick_leave" (
    "id"         TEXT      NOT NULL PRIMARY KEY,
    "staff_id"   TEXT      NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE,
    "start_date" TEXT      NOT NULL,
    "end_date"   TEXT      NOT NULL,
    "reason"     TEXT,
    "status"     TEXT      NOT NULL DEFAULT 'approved',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "staff_sick_leave_staff_id_idx" ON "staff_sick_leave"("staff_id");
CREATE INDEX IF NOT EXISTS "staff_sick_leave_start_date_idx" ON "staff_sick_leave"("start_date");
