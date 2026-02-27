-- Run this in the Neon SQL Editor
-- Creates the email_recipients table for the "Email report" dropdown

CREATE TABLE IF NOT EXISTS "email_recipients" (
    "id"         TEXT      NOT NULL PRIMARY KEY,
    "label"      TEXT      NOT NULL,
    "email"      TEXT      NOT NULL,
    "sort_order" INTEGER   NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
