-- CreateTable: OverShortItem - structured overage/shortage line items per shift.
-- Additive only: no existing tables or columns modified. Safe to run.
-- Existing overShortTotal, overShortExplained, overShortExplanation unchanged.

CREATE TABLE "over_short_items" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "over_short_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "over_short_items" ADD CONSTRAINT "over_short_items_shift_id_fkey" 
    FOREIGN KEY ("shift_id") REFERENCES "shift_close"("id") ON DELETE CASCADE ON UPDATE CASCADE;
