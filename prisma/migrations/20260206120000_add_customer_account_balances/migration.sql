-- CreateTable
CREATE TABLE "customer_account_balances" (
    "id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "balance_override" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_account_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_account_balances_customer_name_key" ON "customer_account_balances"("customer_name");
