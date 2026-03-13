-- Add sick_leave_id to staff_document (links doctor's note to sick leave record)
-- Run in Neon SQL Editor

ALTER TABLE "staff_document" ADD COLUMN IF NOT EXISTS "sick_leave_id" TEXT REFERENCES "staff_sick_leave"("id") ON DELETE SET NULL;
