-- Staff pay type and rates for station gross pay runs.
ALTER TABLE "staff" ADD COLUMN "pay_type" TEXT NOT NULL DEFAULT 'hourly';
ALTER TABLE "staff" ADD COLUMN "hourly_rate" DOUBLE PRECISION;
ALTER TABLE "staff" ADD COLUMN "salaried_amount" DOUBLE PRECISION;

-- Gross pay run (one per saved pay period + cycle).
CREATE TABLE "pay_runs" (
    "id" TEXT NOT NULL,
    "pay_period_id" TEXT NOT NULL,
    "cycle" TEXT NOT NULL DEFAULT 'semimonthly',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pay_date" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL DEFAULT 'Total Auto Service Station',
    "notes" TEXT NOT NULL DEFAULT '',
    "source_hash" TEXT NOT NULL DEFAULT '',
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pay_run_lines" (
    "id" TEXT NOT NULL,
    "pay_run_id" TEXT NOT NULL,
    "staff_id" TEXT,
    "staff_name" TEXT NOT NULL,
    "staff_no" TEXT,
    "pay_type" TEXT NOT NULL DEFAULT 'hourly',
    "pay_cycle" TEXT NOT NULL DEFAULT 'semimonthly',
    "trans_ttl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "basic_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ot_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hourly_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salaried_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "basic_pay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ot_pay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extra_pay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extra_lines" TEXT NOT NULL DEFAULT '[]',
    "gross_pay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shortage_ready" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pay_run_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pay_run_period_cycle" ON "pay_runs"("pay_period_id", "cycle");
CREATE INDEX "pay_runs_status_idx" ON "pay_runs"("status");
CREATE INDEX "pay_run_lines_pay_run_id_idx" ON "pay_run_lines"("pay_run_id");

ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pay_run_lines" ADD CONSTRAINT "pay_run_lines_pay_run_id_fkey" FOREIGN KEY ("pay_run_id") REFERENCES "pay_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pay_run_lines" ADD CONSTRAINT "pay_run_lines_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
