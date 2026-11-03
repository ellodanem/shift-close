-- Accountant spreadsheet comparison: uploads and the tasks they produce.
CREATE TABLE IF NOT EXISTS "cashbook_uploads" (
  "id" TEXT NOT NULL,
  "account" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "period_start" TEXT NOT NULL,
  "period_end" TEXT NOT NULL,
  "opening_balance" DOUBLE PRECISION,
  "lines_json" JSONB NOT NULL,
  "summary_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cashbook_uploads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cashbook_uploads_account_created_at_idx"
  ON "cashbook_uploads"("account", "created_at");

CREATE TABLE IF NOT EXISTS "cashbook_tasks" (
  "id" TEXT NOT NULL,
  "upload_id" TEXT,
  "fingerprint" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "account" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '',
  "date" TEXT,
  "amount" DOUBLE PRECISION,
  "ref" TEXT NOT NULL DEFAULT '',
  "route" TEXT NOT NULL DEFAULT 'cashbook',
  "can_create" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB,
  "assignee" TEXT NOT NULL DEFAULT 'me',
  "resolution" TEXT NOT NULL DEFAULT '',
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cashbook_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cashbook_tasks_upload_id_fkey" FOREIGN KEY ("upload_id")
    REFERENCES "cashbook_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "cashbook_tasks_fingerprint_key" ON "cashbook_tasks"("fingerprint");
CREATE INDEX IF NOT EXISTS "cashbook_tasks_status_account_idx" ON "cashbook_tasks"("status", "account");
CREATE INDEX IF NOT EXISTS "cashbook_tasks_upload_id_idx" ON "cashbook_tasks"("upload_id");
