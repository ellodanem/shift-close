-- CreateTable
CREATE TABLE "applicant_forms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "applicant_applications" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "applicant_forms_slug_key" ON "applicant_forms"("slug");

-- CreateIndex
CREATE INDEX "applicant_applications_applicant_email_idx" ON "applicant_applications"("applicant_email");

-- CreateIndex
CREATE INDEX "applicant_applications_applicant_name_idx" ON "applicant_applications"("applicant_name");

-- CreateIndex
CREATE INDEX "applicant_applications_form_id_status_idx" ON "applicant_applications"("form_id", "status");

-- CreateIndex
CREATE INDEX "applicant_applications_submitted_at_idx" ON "applicant_applications"("submitted_at");

-- AddForeignKey
ALTER TABLE "applicant_applications" ADD CONSTRAINT "applicant_applications_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "applicant_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
