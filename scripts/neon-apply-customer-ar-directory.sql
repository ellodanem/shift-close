-- Run once in Neon SQL Editor. Additive only.
CREATE TABLE IF NOT EXISTS "customer_ar_directory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cstore_name" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_ar_directory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_ar_directory_name_key"
  ON "customer_ar_directory"("name");

CREATE INDEX IF NOT EXISTS "customer_ar_directory_active_name_idx"
  ON "customer_ar_directory"("active", "name");
