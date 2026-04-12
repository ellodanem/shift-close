-- Prior charges/payments before last upsert (dashboard hover deltas)
ALTER TABLE "customer_ar_summary" ADD COLUMN "charges_previous" DOUBLE PRECISION;
ALTER TABLE "customer_ar_summary" ADD COLUMN "payments_previous" DOUBLE PRECISION;
