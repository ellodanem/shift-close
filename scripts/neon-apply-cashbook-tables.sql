-- Run this in Neon SQL Editor to create cashbook tables for expense/income tracking.
-- Safe to run more than once (uses IF NOT EXISTS).

-- Cashbook categories (expense, income, other)
CREATE TABLE IF NOT EXISTS "cashbook_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "type" TEXT NOT NULL DEFAULT 'expense',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "cashbook_categories_pkey" PRIMARY KEY ("id")
);

-- Cashbook entries (debits/credits per row)
CREATE TABLE IF NOT EXISTS "cashbook_entries" (
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

-- Cashbook allocations (links entry to category with amount)
CREATE TABLE IF NOT EXISTS "cashbook_allocations" (
  "id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "cashbook_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cashbook_allocations_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "cashbook_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cashbook_allocations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "cashbook_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Index for date-range queries
CREATE INDEX IF NOT EXISTS "cashbook_entries_date_idx" ON "cashbook_entries"("date");
