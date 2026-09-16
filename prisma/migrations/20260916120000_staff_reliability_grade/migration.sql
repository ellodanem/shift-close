-- Placeholder staff reliability letter grade (A–F). Will become a calculated score later.
ALTER TABLE "staff" ADD COLUMN "reliability_grade" TEXT;

-- Seed random placeholder grades. Everyone except Jervis gets A–C; Jervis may get D or F.
UPDATE "staff"
SET "reliability_grade" = CASE
  WHEN LOWER(COALESCE("name", '') || ' ' || COALESCE("first_name", '') || ' ' || COALESCE("last_name", '')) LIKE '%jervis%'
    THEN (ARRAY['D', 'F'])[1 + FLOOR(RANDOM() * 2)::INT]
  ELSE (ARRAY['A', 'B', 'C'])[1 + FLOOR(RANDOM() * 3)::INT]
END
WHERE "reliability_grade" IS NULL;
