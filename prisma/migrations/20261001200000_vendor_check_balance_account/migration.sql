-- Which operating balance a cleared vendor check was deducted from.
ALTER TABLE "vendor_payment_batches" ADD COLUMN IF NOT EXISTS "cleared_balance_account" TEXT;
