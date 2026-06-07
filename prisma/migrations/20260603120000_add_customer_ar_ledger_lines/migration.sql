-- CreateTable
CREATE TABLE "customer_ar_ledger_lines" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "line_type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "memo" TEXT,
    "payment_method" TEXT,
    "ref" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "payment_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_ar_ledger_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_ar_ledger_lines_payment_id_key" ON "customer_ar_ledger_lines"("payment_id");

-- CreateIndex
CREATE INDEX "customer_ar_ledger_lines_account_date_idx" ON "customer_ar_ledger_lines"("account", "date");

-- CreateIndex
CREATE INDEX "customer_ar_ledger_lines_account_idx" ON "customer_ar_ledger_lines"("account");

-- AddForeignKey
ALTER TABLE "customer_ar_ledger_lines" ADD CONSTRAINT "customer_ar_ledger_lines_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "customer_ar_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
