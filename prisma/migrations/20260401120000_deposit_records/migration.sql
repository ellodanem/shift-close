-- CreateTable
CREATE TABLE "deposit_records" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "line_index" INTEGER NOT NULL,
    "bank_status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT NOT NULL DEFAULT '',
    "security_slip_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deposit_records_shift_id_line_index_key" ON "deposit_records"("shift_id", "line_index");

CREATE INDEX "deposit_records_shift_id_idx" ON "deposit_records"("shift_id");

ALTER TABLE "deposit_records" ADD CONSTRAINT "deposit_records_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift_close"("id") ON DELETE CASCADE ON UPDATE CASCADE;
