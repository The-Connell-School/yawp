-- Remove only the rows this migration added when they have no assignments.
DELETE FROM "AssignmentType"
WHERE "kind" IN ('class_starter', 'prewriting', 'thesis_statement')
  AND NOT EXISTS (
    SELECT 1 FROM "Assignment" a WHERE a."assignmentTypeId" = "AssignmentType"."id"
  );
