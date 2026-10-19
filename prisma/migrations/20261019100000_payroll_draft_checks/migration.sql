-- Draft checks created from an approved payroll.  A payroll line can only create one check.
ALTER TABLE "cashbook_entries"
  ADD COLUMN "payroll_pay_run_id" TEXT,
  ADD COLUMN "payroll_pay_run_line_id" TEXT,
  ADD COLUMN "payroll_check_status" TEXT;

CREATE UNIQUE INDEX "cashbook_entries_payroll_pay_run_line_id_key"
  ON "cashbook_entries"("payroll_pay_run_line_id");

CREATE INDEX "cashbook_entries_payroll_pay_run_id_idx"
  ON "cashbook_entries"("payroll_pay_run_id");
