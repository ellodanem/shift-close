-- Void keeps the payroll and who voided it. A new run can be opened for the same period.
DROP INDEX IF EXISTS "pay_run_period_cycle";

ALTER TABLE "pay_runs" ADD COLUMN "voided_at" TIMESTAMP(3);
ALTER TABLE "pay_runs" ADD COLUMN "void_reason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "pay_runs" ADD COLUMN "voided_by_id" TEXT;
ALTER TABLE "pay_runs" ADD COLUMN "voided_by_name" TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX "pay_run_open_period_cycle" ON "pay_runs" ("pay_period_id", "cycle") WHERE "status" <> 'void';
CREATE INDEX "pay_runs_pay_period_id_cycle_idx" ON "pay_runs" ("pay_period_id", "cycle");

ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
