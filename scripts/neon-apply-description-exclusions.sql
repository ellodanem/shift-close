-- Run this in Neon SQL Editor to add cashbook description exclusions table.
-- Used for hiding descriptions from the suggestion dropdown.
-- Safe to run more than once (uses IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "cashbook_description_exclusions" (
  "id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  CONSTRAINT "cashbook_description_exclusions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cashbook_description_exclusions_description_type_key"
  ON "cashbook_description_exclusions"("description", "type");
