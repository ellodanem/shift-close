-- Run this in Neon SQL Editor to add customer_ar_payments table.
-- Additive only: no existing tables or columns modified.
-- Run once. If table already exists, skip or run CREATE only.

CREATE TABLE IF NOT EXISTS "customer_ar_payments" (
  "id" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "account" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "payment_method" TEXT,
  "ref" TEXT,
  "notes" TEXT DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_ar_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_ar_payments_date_idx" ON "customer_ar_payments"("date");
CREATE INDEX IF NOT EXISTS "customer_ar_payments_account_idx" ON "customer_ar_payments"("account");
