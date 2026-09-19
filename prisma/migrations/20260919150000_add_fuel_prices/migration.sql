-- Posted pump (selling) and supplier (cost) unit prices with dated history.
CREATE TABLE "fuel_prices" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "price_per_litre" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'litre',
    "effective_from" TEXT NOT NULL,
    "effective_to" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMP(3),

    CONSTRAINT "fuel_prices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fuel_prices_product_kind_effective_from_idx" ON "fuel_prices"("product", "kind", "effective_from");
CREATE INDEX "fuel_prices_product_kind_superseded_at_idx" ON "fuel_prices"("product", "kind", "superseded_at");
