-- Add home address to staff (required on create/update in app; existing rows default to empty)
ALTER TABLE "staff"
ADD COLUMN "address" TEXT NOT NULL DEFAULT '';
