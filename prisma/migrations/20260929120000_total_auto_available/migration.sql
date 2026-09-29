-- Total Auto available balance, used only as a suggestion on proposed fuel payments.
ALTER TABLE "balances" ADD COLUMN IF NOT EXISTS "total_auto_available" DOUBLE PRECISION NOT NULL DEFAULT 0;
