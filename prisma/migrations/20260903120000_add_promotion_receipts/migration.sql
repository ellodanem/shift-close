-- CreateTable
CREATE TABLE "promotion_receipts" (
    "id" TEXT NOT NULL,
    "promotion_id" TEXT NOT NULL,
    "receipt_date" TEXT NOT NULL,
    "entrant_name" TEXT NOT NULL,
    "staff_id" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "bus_registration" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotion_receipts_promotion_id_receipt_date_idx" ON "promotion_receipts"("promotion_id", "receipt_date");

-- CreateIndex
CREATE INDEX "promotion_receipts_promotion_id_idx" ON "promotion_receipts"("promotion_id");

-- CreateIndex
CREATE INDEX "promotion_receipts_staff_id_idx" ON "promotion_receipts"("staff_id");

-- AddForeignKey
ALTER TABLE "promotion_receipts" ADD CONSTRAINT "promotion_receipts_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_receipts" ADD CONSTRAINT "promotion_receipts_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
