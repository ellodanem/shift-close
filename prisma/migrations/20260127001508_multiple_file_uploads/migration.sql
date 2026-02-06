/*
  Warnings:

  - You are about to drop the column `debit_scan_url` on the `shift_close` table. All the data in the column will be lost.
  - You are about to drop the column `deposit_scan_url` on the `shift_close` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_shift_close" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "supervisor" TEXT NOT NULL,
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
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_shift_close" ("count_cash", "count_checks", "count_credit", "count_fleet", "count_inhouse", "count_massy_coupons", "created_at", "date", "deposits", "diesel", "id", "notes", "other_credit", "over_short_cash", "over_short_total", "shift", "supervisor", "system_cash", "system_checks", "system_credit", "system_debit", "system_fleet", "system_inhouse", "system_massy_coupons", "total_deposits", "unleaded") SELECT "count_cash", "count_checks", "count_credit", "count_fleet", "count_inhouse", "count_massy_coupons", "created_at", "date", "deposits", "diesel", "id", "notes", "other_credit", "over_short_cash", "over_short_total", "shift", "supervisor", "system_cash", "system_checks", "system_credit", "system_debit", "system_fleet", "system_inhouse", "system_massy_coupons", "total_deposits", "unleaded" FROM "shift_close";
DROP TABLE "shift_close";
ALTER TABLE "new_shift_close" RENAME TO "shift_close";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
