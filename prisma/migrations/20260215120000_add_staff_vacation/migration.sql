-- Add vacation date range to staff (blocks scheduling in roster during period)
ALTER TABLE "staff" ADD COLUMN "vacation_start" TEXT;
ALTER TABLE "staff" ADD COLUMN "vacation_end" TEXT;
