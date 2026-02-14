-- AlterTable
ALTER TABLE "cashbook_entries" ADD COLUMN "debitCheck" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "cashbook_entries" ADD COLUMN "payment_method" TEXT;
