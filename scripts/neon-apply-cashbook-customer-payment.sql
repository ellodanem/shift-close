-- Run in Neon SQL Editor: book customer payments into the cashbook as deposits.
-- Safe to run more than once.

ALTER TABLE "customer_ar_payments" ADD COLUMN IF NOT EXISTS "cashbook_synced" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "cashbook_entries" ADD COLUMN IF NOT EXISTS "customer_ar_payment_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "cashbook_entries_customer_ar_payment_id_key"
  ON "cashbook_entries" ("customer_ar_payment_id");

ALTER TABLE "cashbook_entries" DROP CONSTRAINT IF EXISTS "cashbook_entries_customer_ar_payment_id_fkey";

ALTER TABLE "cashbook_entries"
  ADD CONSTRAINT "cashbook_entries_customer_ar_payment_id_fkey"
  FOREIGN KEY ("customer_ar_payment_id") REFERENCES "customer_ar_payments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
