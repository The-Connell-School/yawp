-- Remove only the rows this migration added (fixed ids), when they have no assignments.
DELETE FROM "AssignmentType"
WHERE "id" IN (
  'cfreeclassstarter00000001',
  'cfreeprewriting000000001',
  'cfreethesisstatement00001'
)
AND NOT EXISTS (
  SELECT 1 FROM "Assignment" a WHERE a."assignmentTypeId" = "AssignmentType"."id"
);
