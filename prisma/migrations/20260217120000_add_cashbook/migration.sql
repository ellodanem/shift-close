-- CreateTable
CREATE TABLE "cashbook_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT NOT NULL DEFAULT 'expense',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cashbook_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashbook_entries" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "ref" TEXT,
    "description" TEXT NOT NULL,
    "debitCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debitEcard" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debitDcard" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditAmt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bank" TEXT,
    "shiftId" TEXT,
    "paymentBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashbook_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashbook_allocations" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "cashbook_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cashbook_entries_date_idx" ON "cashbook_entries"("date");

-- AddForeignKey
ALTER TABLE "cashbook_allocations" ADD CONSTRAINT "cashbook_allocations_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "cashbook_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashbook_allocations" ADD CONSTRAINT "cashbook_allocations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "cashbook_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
