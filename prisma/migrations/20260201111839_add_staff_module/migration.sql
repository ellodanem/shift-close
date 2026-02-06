-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "date_of_birth" TEXT,
    "start_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "role" TEXT NOT NULL DEFAULT 'cashier',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_shift_close" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "supervisor" TEXT NOT NULL,
    "supervisor_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'closed',
    "system_cash" REAL NOT NULL,
    "system_checks" REAL NOT NULL,
    "system_credit" REAL NOT NULL,
    "system_debit" REAL NOT NULL,
    "other_credit" REAL NOT NULL,
    "system_inhouse" REAL NOT NULL,
    "system_fleet" REAL NOT NULL,
    "system_massy_coupons" REAL NOT NULL,
    "count_cash" REAL NOT NULL,
    "count_checks" REAL NOT NULL,
    "count_credit" REAL NOT NULL,
    "count_inhouse" REAL NOT NULL,
    "count_fleet" REAL NOT NULL,
    "count_massy_coupons" REAL NOT NULL,
    "unleaded" REAL NOT NULL,
    "diesel" REAL NOT NULL,
    "deposits" TEXT NOT NULL,
    "over_short_cash" REAL,
    "over_short_total" REAL,
    "total_deposits" REAL,
    "notes" TEXT NOT NULL DEFAULT '',
    "deposit_scan_urls" TEXT NOT NULL DEFAULT '[]',
    "debit_scan_urls" TEXT NOT NULL DEFAULT '[]',
    "has_missing_hard_copy_data" BOOLEAN NOT NULL DEFAULT false,
    "missing_data_notes" TEXT NOT NULL DEFAULT '',
    "over_short_explained" BOOLEAN NOT NULL DEFAULT false,
    "over_short_explanation" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shift_close_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_shift_close" ("count_cash", "count_checks", "count_credit", "count_fleet", "count_inhouse", "count_massy_coupons", "created_at", "date", "debit_scan_urls", "deposit_scan_urls", "deposits", "diesel", "has_missing_hard_copy_data", "id", "missing_data_notes", "notes", "other_credit", "over_short_cash", "over_short_explained", "over_short_explanation", "over_short_total", "shift", "status", "supervisor", "system_cash", "system_checks", "system_credit", "system_debit", "system_fleet", "system_inhouse", "system_massy_coupons", "total_deposits", "unleaded") SELECT "count_cash", "count_checks", "count_credit", "count_fleet", "count_inhouse", "count_massy_coupons", "created_at", "date", "debit_scan_urls", "deposit_scan_urls", "deposits", "diesel", "has_missing_hard_copy_data", "id", "missing_data_notes", "notes", "other_credit", "over_short_cash", "over_short_explained", "over_short_explanation", "over_short_total", "shift", "status", "supervisor", "system_cash", "system_checks", "system_credit", "system_debit", "system_fleet", "system_inhouse", "system_massy_coupons", "total_deposits", "unleaded" FROM "shift_close";
DROP TABLE "shift_close";
ALTER TABLE "new_shift_close" RENAME TO "shift_close";
CREATE UNIQUE INDEX "shift_close_date_shift_key" ON "shift_close"("date", "shift");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
