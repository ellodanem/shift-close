-- Recurring staff deductions used on each pay run.
ALTER TABLE "staff" ADD COLUMN "staff_loan" DOUBLE PRECISION;
ALTER TABLE "staff" ADD COLUMN "medical_amount" DOUBLE PRECISION;

-- Station deductions and net on each pay-run line.
ALTER TABLE "pay_run_lines" ADD COLUMN "extra_deductions" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "pay_run_lines" ADD COLUMN "extra_deduction_pay" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "pay_run_lines" ADD COLUMN "nis_employee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "pay_run_lines" ADD COLUMN "nis_employer" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "pay_run_lines" ADD COLUMN "staff_loan" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "pay_run_lines" ADD COLUMN "medical" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "pay_run_lines" ADD COLUMN "total_deductions" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "pay_run_lines" ADD COLUMN "net_pay" DOUBLE PRECISION NOT NULL DEFAULT 0;
