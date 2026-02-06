-- CreateTable
CREATE TABLE "historical_fuel_data" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "unleaded_litres" REAL,
    "diesel_litres" REAL,
    "unleaded_gallons" REAL,
    "diesel_gallons" REAL,
    "unleaded_from_gallons" REAL,
    "diesel_from_gallons" REAL,
    "source" TEXT DEFAULT 'google_sheet_import',
    "imported_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "historical_fuel_data_date_key" ON "historical_fuel_data"("date");
