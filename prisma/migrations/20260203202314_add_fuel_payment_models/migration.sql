-- CreateTable
CREATE TABLE "payment_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentDate" DATETIME NOT NULL,
    "bankRef" TEXT NOT NULL,
    "total_amount" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "paid_invoices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoice_number" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "invoice_date" DATETIME NOT NULL,
    "due_date" DATETIME NOT NULL,
    "notes" TEXT DEFAULT '',
    "batch_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "paid_invoices_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "payment_batches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payment_corrections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batch_id" TEXT,
    "invoice_id" TEXT,
    "field" TEXT NOT NULL,
    "old_value" TEXT NOT NULL,
    "new_value" TEXT NOT NULL,
    "reason" TEXT,
    "changed_by" TEXT NOT NULL DEFAULT 'admin',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_corrections_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "payment_batches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payment_corrections_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "paid_invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "payment_batches_paymentDate_idx" ON "payment_batches"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "payment_batches_paymentDate_bankRef_key" ON "payment_batches"("paymentDate", "bankRef");

-- CreateIndex
CREATE INDEX "paid_invoices_invoice_number_idx" ON "paid_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "paid_invoices_batch_id_idx" ON "paid_invoices"("batch_id");

-- CreateIndex
CREATE INDEX "payment_corrections_batch_id_idx" ON "payment_corrections"("batch_id");

-- CreateIndex
CREATE INDEX "payment_corrections_invoice_id_idx" ON "payment_corrections"("invoice_id");
