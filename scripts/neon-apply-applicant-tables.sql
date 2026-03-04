-- Add applicant forms and applications tables (run manually if migrate fails)
-- Execute in Neon SQL Editor or: psql $DATABASE_URL -f scripts/neon-apply-applicant-tables.sql

CREATE TABLE IF NOT EXISTS "applicant_forms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "deftform_form_id" TEXT,
    "position" TEXT NOT NULL DEFAULT '',
    "intro_text" TEXT NOT NULL DEFAULT '',
    "fields" TEXT NOT NULL,
    "confirmation_text" TEXT NOT NULL DEFAULT '',
    "confirmation_bullets" TEXT NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applicant_forms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "applicant_applications" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "deftform_response_id" TEXT,
    "applicant_name" TEXT NOT NULL,
    "applicant_email" TEXT,
    "pdf_url" TEXT NOT NULL,
    "resume_url" TEXT,
    "form_data" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'new',
    "viewed_at" TIMESTAMP(3),
    "printed_at" TIMESTAMP(3),
    "contacted_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "applicant_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "applicant_forms_slug_key" ON "applicant_forms"("slug");
CREATE INDEX IF NOT EXISTS "applicant_applications_applicant_email_idx" ON "applicant_applications"("applicant_email");
CREATE INDEX IF NOT EXISTS "applicant_applications_applicant_name_idx" ON "applicant_applications"("applicant_name");
CREATE INDEX IF NOT EXISTS "applicant_applications_form_id_status_idx" ON "applicant_applications"("form_id", "status");
CREATE INDEX IF NOT EXISTS "applicant_applications_submitted_at_idx" ON "applicant_applications"("submitted_at");
CREATE UNIQUE INDEX IF NOT EXISTS "applicant_applications_deftform_response_id_key"
  ON "applicant_applications"("deftform_response_id") WHERE "deftform_response_id" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'applicant_applications_form_id_fkey'
  ) THEN
    ALTER TABLE "applicant_applications" ADD CONSTRAINT "applicant_applications_form_id_fkey"
      FOREIGN KEY ("form_id") REFERENCES "applicant_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
