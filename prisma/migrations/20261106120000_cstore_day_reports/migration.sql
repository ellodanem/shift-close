-- Cstore daily report snapshot, one row per day. Read-only comparison data for End of Day V2.
CREATE TABLE IF NOT EXISTS "cstore_day_reports" (
  "id" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "grocery" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sales_tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "regular_amt" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "diesel_amt" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cust_account_pay_in" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total_sales" DOUBLE PRECISION NOT NULL,
  "deposits_typed" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fleet_batch" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "credit_debit_batch" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cust_account_sales" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total_collections" DOUBLE PRECISION NOT NULL,
  "short_over" DOUBLE PRECISION NOT NULL,
  "regular_litres" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "diesel_litres" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tank_json" JSONB,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "pulled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cstore_day_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cstore_day_reports_date_key" ON "cstore_day_reports"("date");
