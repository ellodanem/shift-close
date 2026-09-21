-- AlterTable
ALTER TABLE "inbox_mailboxes" ADD COLUMN "auth_method" TEXT NOT NULL DEFAULT 'password';
ALTER TABLE "inbox_mailboxes" ADD COLUMN "oauth_access_token" TEXT;
ALTER TABLE "inbox_mailboxes" ADD COLUMN "oauth_refresh_token" TEXT;
ALTER TABLE "inbox_mailboxes" ADD COLUMN "oauth_expires_at" TIMESTAMP(3);

-- Outlook.com official IMAP host (Microsoft Support)
UPDATE "inbox_mailboxes"
SET "imap_host" = 'outlook.office365.com', "imap_port" = 993, "imap_secure" = true
WHERE "key" = 'os' OR "email_address" ILIKE '%@outlook.com' OR "email_address" ILIKE '%@hotmail.com' OR "email_address" ILIKE '%@live.com';
