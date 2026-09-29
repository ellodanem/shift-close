-- Service Station / Total Auto current balance, paired with total_auto_available.
ALTER TABLE "balances" ADD COLUMN IF NOT EXISTS "total_auto_current_balance" DOUBLE PRECISION NOT NULL DEFAULT 0;
