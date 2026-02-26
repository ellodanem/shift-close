-- Run this in the Neon SQL Editor
-- Creates the customer_account_balances table for manual balance overrides

CREATE TABLE IF NOT EXISTS "customer_account_balances" (
    "id"               TEXT      NOT NULL PRIMARY KEY,
    "customer_name"    TEXT      NOT NULL UNIQUE,
    "balance_override" DOUBLE PRECISION NOT NULL,
    "notes"            TEXT,
    "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
