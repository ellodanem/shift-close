-- CreateTable
CREATE TABLE "customer_ar_import_logs" (
    "id" TEXT NOT NULL,
    "week_key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "account_count" INTEGER NOT NULL,
    "accounts_with_charges" INTEGER NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,

    CONSTRAINT "customer_ar_import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_ar_import_logs_week_key_year_month_key" ON "customer_ar_import_logs"("week_key", "year", "month");

-- CreateIndex
CREATE INDEX "customer_ar_import_logs_week_key_idx" ON "customer_ar_import_logs"("week_key");
