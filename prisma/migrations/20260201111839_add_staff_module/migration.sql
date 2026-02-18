-- PostgreSQL migration: add basic staff table and supervisor_id link

CREATE TABLE IF NOT EXISTS "staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "date_of_birth" TEXT,
    "start_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "role" TEXT NOT NULL DEFAULT 'cashier',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "shift_close"
ADD COLUMN IF NOT EXISTS "supervisor_id" TEXT;

ALTER TABLE "shift_close"
ADD CONSTRAINT "shift_close_supervisor_id_fkey"
FOREIGN KEY ("supervisor_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "shift_close_date_shift_key" ON "shift_close"("date", "shift");

