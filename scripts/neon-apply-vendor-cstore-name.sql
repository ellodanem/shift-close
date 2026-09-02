-- Cstore alias for vendor name mapping (harvest agent). Run once in Neon SQL editor.
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "cstore_name" TEXT;
