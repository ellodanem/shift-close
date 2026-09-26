-- Roster label. Existing staff keep the current roster name (first name).
ALTER TABLE "staff" ADD COLUMN "display_name" TEXT;

UPDATE "staff"
SET "display_name" = CASE
  WHEN TRIM(COALESCE("first_name", '')) <> '' THEN TRIM("first_name")
  WHEN TRIM(COALESCE("name", '')) <> '' THEN TRIM(SPLIT_PART("name", ' ', 1))
  ELSE ''
END
WHERE "display_name" IS NULL;

ALTER TABLE "staff" ALTER COLUMN "display_name" SET DEFAULT '';
ALTER TABLE "staff" ALTER COLUMN "display_name" SET NOT NULL;
