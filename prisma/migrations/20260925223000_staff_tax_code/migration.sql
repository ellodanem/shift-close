-- PAYE tax code on the staff record and on a pay-run line (this run can differ).
ALTER TABLE "staff" ADD COLUMN "tax_code" TEXT NOT NULL DEFAULT '';
ALTER TABLE "pay_run_lines" ADD COLUMN "tax_code" TEXT NOT NULL DEFAULT '';
