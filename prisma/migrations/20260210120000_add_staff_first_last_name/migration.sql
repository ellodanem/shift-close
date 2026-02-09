-- Add first_name and last_name to staff; backfill from existing name
ALTER TABLE "staff" ADD COLUMN "first_name" TEXT;
ALTER TABLE "staff" ADD COLUMN "last_name" TEXT;

-- Backfill: names containing a space -> first word / rest
UPDATE "staff"
SET
  "first_name" = TRIM(SPLIT_PART("name", ' ', 1)),
  "last_name"  = TRIM(SUBSTRING("name" FROM POSITION(' ' IN "name") + 1))
WHERE POSITION(' ' IN COALESCE("name", '')) > 0;

-- Single-word or empty name -> first_name gets name, last_name empty
UPDATE "staff"
SET "first_name" = COALESCE(TRIM("name"), ''), "last_name" = ''
WHERE "first_name" IS NULL;

ALTER TABLE "staff" ALTER COLUMN "first_name" SET DEFAULT '';
ALTER TABLE "staff" ALTER COLUMN "last_name" SET DEFAULT '';
ALTER TABLE "staff" ALTER COLUMN "first_name" SET NOT NULL;
ALTER TABLE "staff" ALTER COLUMN "last_name" SET NOT NULL;
