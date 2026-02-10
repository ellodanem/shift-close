-- CreateTable
CREATE TABLE "shift_close" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "supervisor" TEXT NOT NULL,
    "system_cash" REAL NOT NULL,
    "system_checks" REAL NOT NULL,
    "system_credit" REAL NOT NULL,
    "system_debit" REAL NOT NULL,
    "system_inhouse" REAL NOT NULL,
    "system_fleet" REAL NOT NULL,
    "count_cash" REAL NOT NULL,
    "count_checks" REAL NOT NULL,
    "unleaded" REAL NOT NULL,
    "diesel" REAL NOT NULL,
    "deposits" TEXT NOT NULL,
    "over_short_cash" REAL,
    "over_short_total" REAL,
    "total_deposits" REAL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "corrections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shift_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT NOT NULL,
    "new_value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "corrections_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift_close" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
