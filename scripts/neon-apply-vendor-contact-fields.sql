-- Optional vendor contact person and number. Run once in Neon SQL editor.
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "contact_person" TEXT;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "contact_number" TEXT;
