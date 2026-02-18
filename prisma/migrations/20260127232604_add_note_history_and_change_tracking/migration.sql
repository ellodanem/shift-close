-- PostgreSQL migration: add note_history table and make correction.reason nullable

CREATE TABLE IF NOT EXISTS "note_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shift_id" TEXT NOT NULL,
    "old_note" TEXT NOT NULL,
    "new_note" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "note_history_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift_close" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "corrections"
ALTER COLUMN "reason" DROP NOT NULL;

