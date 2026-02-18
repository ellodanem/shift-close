-- Run this in Neon SQL Editor to remove duplicate "Bank Transfer" category.
-- Keeps the first one (by id), reassigns any allocations to it, then deletes the duplicate(s).

DO $$
DECLARE
  keep_id TEXT;
  dup RECORD;
BEGIN
  -- Get the id of the first "Bank Transfer" category to keep
  SELECT id INTO keep_id
  FROM cashbook_categories
  WHERE LOWER(TRIM(name)) = 'bank transfer'
  ORDER BY id
  LIMIT 1;

  IF keep_id IS NULL THEN
    RAISE NOTICE 'No "Bank Transfer" category found.';
    RETURN;
  END IF;

  -- Reassign any allocations from duplicate categories to the one we keep
  UPDATE cashbook_allocations
  SET category_id = keep_id
  WHERE category_id IN (
    SELECT id FROM cashbook_categories
    WHERE LOWER(TRIM(name)) = 'bank transfer'
    AND id != keep_id
  );

  -- Delete the duplicate categories
  DELETE FROM cashbook_categories
  WHERE LOWER(TRIM(name)) = 'bank transfer'
  AND id != keep_id;

  RAISE NOTICE 'Removed duplicate "Bank Transfer" category. Kept id: %', keep_id;
END $$;
