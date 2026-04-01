-- Add record_kind so one shift can have deposit lines (lineIndex 0..n) and a debit row (lineIndex 0, kind debit).
ALTER TABLE "deposit_records" ADD COLUMN "record_kind" TEXT NOT NULL DEFAULT 'deposit';

-- Replace uniqueness: (shift_id, line_index) -> (shift_id, record_kind, line_index)
DROP INDEX IF EXISTS "deposit_records_shift_id_line_index_key";

CREATE UNIQUE INDEX "deposit_records_shift_id_record_kind_line_index_key" ON "deposit_records"("shift_id", "record_kind", "line_index");
