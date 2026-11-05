-- Rollback: clear strode_autobiography kind (manual re-link may be needed)
UPDATE "AssignmentType"
SET "kind" = NULL, "updatedAt" = NOW()
WHERE "kind" = 'strode_autobiography';

DELETE FROM "Rubric" WHERE "name" = 'strode-eng101-essay-2-autobiography';
