-- Customer A/R payments book to cashbook income as deposits.
ALTER TABLE "customer_ar_payments" ADD COLUMN "cashbook_synced" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "cashbook_entries" ADD COLUMN "customer_ar_payment_id" TEXT;

CREATE UNIQUE INDEX "cashbook_entries_customer_ar_payment_id_key" ON "cashbook_entries"("customer_ar_payment_id");

ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_customer_ar_payment_id_fkey" FOREIGN KEY ("customer_ar_payment_id") REFERENCES "customer_ar_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
