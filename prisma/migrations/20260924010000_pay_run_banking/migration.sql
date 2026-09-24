-- Banking pack: snapshot bank on each line, and extra cash-out on the run.
ALTER TABLE "pay_runs" ADD COLUMN "extra_disbursements" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "pay_run_lines" ADD COLUMN "bank_code" TEXT NOT NULL DEFAULT '';
ALTER TABLE "pay_run_lines" ADD COLUMN "account_no" TEXT;
