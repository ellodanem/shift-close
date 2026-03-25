-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notification_email" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_invoices" (
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

-- CreateTable
CREATE TABLE "vendor_payment_batches" (
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

-- CreateTable
CREATE TABLE "paid_vendor_invoices" (
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

-- CreateIndex
CREATE UNIQUE INDEX "vendor_invoices_vendor_id_invoice_number_key" ON "vendor_invoices"("vendor_id", "invoice_number");

-- CreateIndex
CREATE INDEX "vendor_invoices_vendor_id_idx" ON "vendor_invoices"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_invoices_status_idx" ON "vendor_invoices"("status");

-- CreateIndex
CREATE INDEX "vendor_payment_batches_vendor_id_idx" ON "vendor_payment_batches"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_payment_batches_payment_date_idx" ON "vendor_payment_batches"("payment_date");

-- CreateIndex
CREATE INDEX "vendor_payment_batches_cleared_at_idx" ON "vendor_payment_batches"("cleared_at");

-- CreateIndex
CREATE UNIQUE INDEX "paid_vendor_invoices_vendor_invoice_id_key" ON "paid_vendor_invoices"("vendor_invoice_id");

-- AddForeignKey
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payment_batches" ADD CONSTRAINT "vendor_payment_batches_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma schema uses onDelete: SetNull on vendor_invoice_id, but the column is NOT NULL; PostgreSQL requires CASCADE or RESTRICT.
ALTER TABLE "paid_vendor_invoices" ADD CONSTRAINT "paid_vendor_invoices_vendor_invoice_id_fkey" FOREIGN KEY ("vendor_invoice_id") REFERENCES "vendor_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paid_vendor_invoices" ADD CONSTRAINT "paid_vendor_invoices_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "vendor_payment_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
