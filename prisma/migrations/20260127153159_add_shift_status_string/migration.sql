-- PostgreSQL migration: add status string to shift_close
ALTER TABLE "shift_close"
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'closed';

