-- Two bank accounts in one cashbook: Westline and Service Station.
-- Existing rows are best-guess assigned and marked 'backfill' so they can be reviewed and confirmed.
ALTER TABLE "cashbook_entries"
  ADD COLUMN IF NOT EXISTS "account" TEXT NOT NULL DEFAULT 'westline',
  ADD COLUMN IF NOT EXISTS "account_source" TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS "transfer_group_id" TEXT;

UPDATE "cashbook_entries" SET "account_source" = 'backfill' WHERE "account_source" = 'default';

-- Card income from closed shifts, payroll checks and Service Station labelled lines.
UPDATE "cashbook_entries"
SET "account" = 'service_station'
WHERE "shift_income_kind" IN ('credit', 'debit')
   OR "payroll_pay_run_id" IS NOT NULL
   OR "bank" ILIKE '%service station%';

-- Vendor checks: Service Station unless a cleared check was deducted from Westline.
UPDATE "cashbook_entries" e
SET "account" = 'service_station'
FROM "vendor_payment_batches" b
WHERE e."vendor_payment_batch_id" = b."id"
  AND b."payment_method" = 'check'
  AND (b."cleared_at" IS NULL OR b."cleared_balance_account" = 'service_station');

CREATE INDEX IF NOT EXISTS "cashbook_entries_account_date_idx" ON "cashbook_entries"("account", "date");
CREATE INDEX IF NOT EXISTS "cashbook_entries_transfer_group_id_idx" ON "cashbook_entries"("transfer_group_id");

CREATE TABLE IF NOT EXISTS "cashbook_account_rules" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "match" TEXT NOT NULL,
  "account" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cashbook_account_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cashbook_account_rules_kind_match_key"
  ON "cashbook_account_rules"("kind", "match");
