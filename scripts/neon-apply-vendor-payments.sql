-- Run this in the Neon SQL Editor to add Vendor Payments tables
-- Shares Balance with fuel payments

CREATE TABLE IF NOT EXISTS "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notification_email" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vendor_invoices" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "vat" DOUBLE PRECISION DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vendor_payment_batches" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "payment_method" TEXT NOT NULL,
    "bank_ref" TEXT NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "transfer_description" TEXT,
    "balance_before" DOUBLE PRECISION,
    "balance_after" DOUBLE PRECISION,
    "cleared_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_payment_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "paid_vendor_invoices" (
    "id" TEXT NOT NULL,
    "vendor_invoice_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "vat" DOUBLE PRECISION DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paid_vendor_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_invoices_vendor_id_invoice_number_key" ON "vendor_invoices"("vendor_id", "invoice_number");
CREATE INDEX IF NOT EXISTS "vendor_invoices_vendor_id_idx" ON "vendor_invoices"("vendor_id");
CREATE INDEX IF NOT EXISTS "vendor_invoices_status_idx" ON "vendor_invoices"("status");

CREATE INDEX IF NOT EXISTS "vendor_payment_batches_vendor_id_idx" ON "vendor_payment_batches"("vendor_id");
CREATE INDEX IF NOT EXISTS "vendor_payment_batches_payment_date_idx" ON "vendor_payment_batches"("payment_date");
CREATE INDEX IF NOT EXISTS "vendor_payment_batches_cleared_at_idx" ON "vendor_payment_batches"("cleared_at");

CREATE UNIQUE INDEX IF NOT EXISTS "paid_vendor_invoices_vendor_invoice_id_key" ON "paid_vendor_invoices"("vendor_invoice_id");

ALTER TABLE "vendor_invoices" DROP CONSTRAINT IF EXISTS "vendor_invoices_vendor_id_fkey";
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_payment_batches" DROP CONSTRAINT IF EXISTS "vendor_payment_batches_vendor_id_fkey";
ALTER TABLE "vendor_payment_batches" ADD CONSTRAINT "vendor_payment_batches_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "paid_vendor_invoices" DROP CONSTRAINT IF EXISTS "paid_vendor_invoices_vendor_invoice_id_fkey";
ALTER TABLE "paid_vendor_invoices" ADD CONSTRAINT "paid_vendor_invoices_vendor_invoice_id_fkey" FOREIGN KEY ("vendor_invoice_id") REFERENCES "vendor_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "paid_vendor_invoices" DROP CONSTRAINT IF EXISTS "paid_vendor_invoices_batch_id_fkey";
ALTER TABLE "paid_vendor_invoices" ADD CONSTRAINT "paid_vendor_invoices_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "vendor_payment_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cashbook_entries" ADD COLUMN IF NOT EXISTS "vendor_payment_batch_id" TEXT;
