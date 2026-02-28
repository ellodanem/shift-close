-- Run in Neon SQL Editor to add mobile_number for WhatsApp
ALTER TABLE "email_recipients" ADD COLUMN IF NOT EXISTS "mobile_number" TEXT;
