-- Run this in the Neon SQL Editor if prisma migrate deploy cannot apply the new column.
-- Adds staff.reliability_grade and seeds placeholder A–F scores.
-- Everyone except Jervis gets A–C; Jervis may get D or F.

ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "reliability_grade" TEXT;

UPDATE "staff"
SET "reliability_grade" = CASE
  WHEN LOWER(COALESCE("name", '') || ' ' || COALESCE("first_name", '') || ' ' || COALESCE("last_name", '')) LIKE '%jervis%'
    THEN (ARRAY['D', 'F'])[1 + FLOOR(RANDOM() * 2)::INT]
  ELSE (ARRAY['A', 'B', 'C'])[1 + FLOOR(RANDOM() * 3)::INT]
END
WHERE "reliability_grade" IS NULL;
