-- Run this in the Neon SQL Editor (project → SQL Editor → paste and run)
-- Adds cheque balance carry-forward fields to the over_short_items table

ALTER TABLE "over_short_items"
    ADD COLUMN IF NOT EXISTS "item_kind"        TEXT    NOT NULL DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS "customer_name"    TEXT,
    ADD COLUMN IF NOT EXISTS "previous_balance" FLOAT,
    ADD COLUMN IF NOT EXISTS "dispensed_amount" FLOAT,
    ADD COLUMN IF NOT EXISTS "new_balance"      FLOAT;
