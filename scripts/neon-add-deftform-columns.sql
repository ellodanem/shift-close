-- Add Deftform columns for API sync (run in Neon SQL Editor)
-- Run after neon-apply-applicant-tables.sql

-- Add deftform_form_id to applicant_forms
ALTER TABLE "applicant_forms" ADD COLUMN IF NOT EXISTS "deftform_form_id" TEXT;

-- Add deftform_response_id to applicant_applications
ALTER TABLE "applicant_applications" ADD COLUMN IF NOT EXISTS "deftform_response_id" TEXT;

-- Unique index for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS "applicant_applications_deftform_response_id_key"
  ON "applicant_applications"("deftform_response_id") WHERE "deftform_response_id" IS NOT NULL;
