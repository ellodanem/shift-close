-- CreateTable
CREATE TABLE "note_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shift_id" TEXT NOT NULL,
    "old_note" TEXT NOT NULL,
    "new_note" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL DEFAULT 'admin',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "note_history_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift_close" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_corrections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shift_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT NOT NULL,
    "new_value" TEXT NOT NULL,
    "reason" TEXT,
    "changed_by" TEXT NOT NULL DEFAULT 'admin',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "corrections_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift_close" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_corrections" ("created_at", "field", "id", "new_value", "old_value", "reason", "shift_id") SELECT "created_at", "field", "id", "new_value", "old_value", "reason", "shift_id" FROM "corrections";
DROP TABLE "corrections";
ALTER TABLE "new_corrections" RENAME TO "corrections";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
