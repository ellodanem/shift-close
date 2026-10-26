-- Bills are visible to the accountant by default. A bill held from accounting
-- becomes submitted automatically when it is paid.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "submitted_to_accounting" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "vendor_invoices" ADD COLUMN IF NOT EXISTS "submitted_to_accounting" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "invoices_submitted_to_accounting_idx" ON "invoices"("submitted_to_accounting");
CREATE INDEX IF NOT EXISTS "vendor_invoices_submitted_to_accounting_idx" ON "vendor_invoices"("submitted_to_accounting");
