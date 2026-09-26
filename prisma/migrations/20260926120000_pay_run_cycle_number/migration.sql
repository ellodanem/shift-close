-- The pay cycle is the period number for the year. One open payroll per attendance period.
ALTER TABLE "pay_runs" ADD COLUMN "cycle_number" INTEGER NOT NULL DEFAULT 0;

UPDATE "pay_runs"
SET "cycle_number" = (
  (CAST(split_part("end_date", '-', 2) AS INTEGER) - 1) * 2
  + CASE
      WHEN CAST(split_part("end_date", '-', 3) AS INTEGER) <= 15 THEN 1
      ELSE 2
    END
)
WHERE "end_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';

-- Keep the newest open run when a period already has more than one.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY pay_period_id
    ORDER BY
      CASE status WHEN 'processed' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      updated_at DESC,
      created_at DESC
  ) AS rn
  FROM pay_runs
  WHERE status <> 'void'
)
UPDATE pay_runs
SET
  status = 'void',
  voided_at = NOW(),
  void_reason = 'Closed because each attendance period now has one payroll.'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

DROP INDEX IF EXISTS "pay_run_open_period_cycle";
CREATE UNIQUE INDEX "pay_run_open_period" ON "pay_runs" ("pay_period_id") WHERE "status" <> 'void';
