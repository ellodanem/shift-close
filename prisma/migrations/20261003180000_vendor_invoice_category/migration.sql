-- Overhead bills store the cashbook expense category they will post to.
ALTER TABLE "vendor_invoices" ADD COLUMN IF NOT EXISTS "category_id" TEXT;

CREATE INDEX IF NOT EXISTS "vendor_invoices_category_id_idx" ON "vendor_invoices"("category_id");

DO $$ BEGIN
  ALTER TABLE "vendor_invoices"
    ADD CONSTRAINT "vendor_invoices_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "cashbook_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
