-- Extra expense lines on the All Invoices monthly report (not tied to a vendor invoice)
CREATE TABLE IF NOT EXISTS "monthly_report_expenses" (
  "id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "payment_method" TEXT,
  "ref" TEXT,
  "cashbook_entry_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "monthly_report_expenses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "monthly_report_expenses_cashbook_entry_id_key"
  ON "monthly_report_expenses"("cashbook_entry_id");

CREATE INDEX IF NOT EXISTS "monthly_report_expenses_month_idx"
  ON "monthly_report_expenses"("month");
