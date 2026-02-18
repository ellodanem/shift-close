-- PostgreSQL migration: add JSON-style scan URL arrays to shift_close
ALTER TABLE "shift_close"
ADD COLUMN IF NOT EXISTS "deposit_scan_urls" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "debit_scan_urls" TEXT NOT NULL DEFAULT '[]';

