-- Delivery litres on fuel invoices (ignored when null).
ALTER TABLE "invoices" ADD COLUMN "unleaded_litres" DOUBLE PRECISION;
ALTER TABLE "invoices" ADD COLUMN "diesel_litres" DOUBLE PRECISION;

CREATE INDEX "invoices_type_invoice_date_idx" ON "invoices"("type", "invoice_date");

-- Opening tank readings and later dip corrections (append-only).
CREATE TABLE "fuel_tank_readings" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "unleaded_litres" DOUBLE PRECISION NOT NULL,
    "diesel_litres" DOUBLE PRECISION NOT NULL,
    "unleaded_delta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diesel_delta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuel_tank_readings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fuel_tank_readings_date_idx" ON "fuel_tank_readings"("date");
CREATE INDEX "fuel_tank_readings_kind_date_idx" ON "fuel_tank_readings"("kind", "date");
