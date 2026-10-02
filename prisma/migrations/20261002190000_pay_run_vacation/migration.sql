-- Hourly vacation is paid as straight-time hours. Existing lines start at zero until the next rebuild.
ALTER TABLE "pay_run_lines" ADD COLUMN "vacation_days" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "pay_run_lines" ADD COLUMN "vacation_hours" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "pay_run_lines" ADD COLUMN "vacation_pay" DOUBLE PRECISION NOT NULL DEFAULT 0;
