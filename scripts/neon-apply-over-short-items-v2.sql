-- Run this in the Neon SQL Editor (project → SQL Editor → paste and run)
-- Adds all Account Activity fields to the over_short_items table
-- Safe to run multiple times (uses IF NOT EXISTS)

ALTER TABLE "over_short_items"
    ADD COLUMN IF NOT EXISTS "item_kind"        TEXT    NOT NULL DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS "payment_method"   TEXT,
    ADD COLUMN IF NOT EXISTS "note_only"        BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "customer_name"    TEXT,
    ADD COLUMN IF NOT EXISTS "previous_balance" FLOAT,
    ADD COLUMN IF NOT EXISTS "dispensed_amount" FLOAT,
    ADD COLUMN IF NOT EXISTS "new_balance"      FLOAT;
