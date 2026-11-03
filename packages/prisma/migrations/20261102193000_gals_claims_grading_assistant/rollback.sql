-- Roll back kind wiring only when no assignment references gals_claims yet.
SET lock_timeout = '5s';

UPDATE "AssignmentType" AS at
SET
  "kind" = NULL,
  "updatedAt" = NOW()
WHERE at."kind" = 'gals_claims'
  AND lower(trim(at."title")) IN ('claims', 'claims assignment')
  AND NOT EXISTS (
    SELECT 1 FROM "Assignment" a WHERE a."assignmentTypeId" = at."id"
  );

DELETE FROM "Rubric"
WHERE "name" = 'gals-claims'
  AND NOT EXISTS (
    SELECT 1
    FROM "AssignmentType" at
    INNER JOIN "Rubric" r ON r."id" = at."rubricId"
    WHERE r."name" = 'gals-claims'
  );
