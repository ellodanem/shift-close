-- Keep legacy staff.role in sync with staff_roles when role_id is set.
UPDATE "staff" AS s
SET "role" = LOWER(REPLACE(sr."name", ' ', '_'))
FROM "staff_roles" AS sr
WHERE s."role_id" = sr."id"
  AND s."role_id" IS NOT NULL
  AND s."role" IS DISTINCT FROM LOWER(REPLACE(sr."name", ' ', '_'));
