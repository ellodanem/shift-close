-- Department sales per shift (manual now; POS can fill the same rows later).
CREATE TABLE "shift_sales" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "pos_key" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_sales_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shift_sales_shift_id_category_pos_key_key" ON "shift_sales"("shift_id", "category", "pos_key");
CREATE INDEX "shift_sales_shift_id_idx" ON "shift_sales"("shift_id");

ALTER TABLE "shift_sales" ADD CONSTRAINT "shift_sales_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift_close"("id") ON DELETE CASCADE ON UPDATE CASCADE;
