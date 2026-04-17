-- Optional due date on vendor invoices (run on Neon if migration not applied)
ALTER TABLE "vendor_invoices" ALTER COLUMN "due_date" DROP NOT NULL;
