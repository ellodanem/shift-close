-- Run this in the Neon SQL Editor (project → SQL Editor → paste and run)
-- Creates the app_settings table for runtime key-value configuration

CREATE TABLE IF NOT EXISTS "app_settings" (
    "key"        TEXT         NOT NULL PRIMARY KEY,
    "value"      TEXT         NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
