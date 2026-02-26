-- Add paymentMethod to customer_account_balances for cheque vs debit separation
-- Existing records default to 'cheque'

ALTER TABLE "customer_account_balances" ADD COLUMN IF NOT EXISTS "payment_method" TEXT NOT NULL DEFAULT 'cheque';

DROP INDEX IF EXISTS "customer_account_balances_customer_name_key";

CREATE UNIQUE INDEX "customer_account_balances_customer_name_payment_method_key" ON "customer_account_balances"("customer_name", "payment_method");
