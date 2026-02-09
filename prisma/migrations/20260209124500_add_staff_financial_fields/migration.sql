-- Add NIC number, bank name, and account number to staff
ALTER TABLE "staff"
ADD COLUMN "nic_number" TEXT,
ADD COLUMN "bank_name" TEXT,
ADD COLUMN "account_number" TEXT;

