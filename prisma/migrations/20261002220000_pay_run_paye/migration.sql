-- PAYE calculated on each pay-run line.
ALTER TABLE "pay_run_lines" ADD COLUMN "paye" DOUBLE PRECISION NOT NULL DEFAULT 0;
