-- Add archived_at column for applicant applications (run in Neon SQL Editor)
-- Run after neon-apply-applicant-tables.sql
-- Applications with a non-null archived_at are hidden from the default list.

ALTER TABLE "applicant_applications" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "applicant_applications_archived_at_idx"
  ON "applicant_applications"("archived_at");
