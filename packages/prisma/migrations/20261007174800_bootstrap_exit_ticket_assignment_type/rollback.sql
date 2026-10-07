-- Roll back after reverting the app deploy, then mark rolled back in Prisma:
--   bun prisma migrate resolve --rolled-back 20261007174800_bootstrap_exit_ticket_assignment_type
--
-- Removes org availability and the bootstrap type only when nothing references it.

DELETE FROM "OrganizationAssignmentType"
WHERE "assignmentTypeId" = 'cexitticket000000000000000';

DELETE FROM "AssignmentModuleInstruction"
WHERE "assignmentModuleId" = 'cexitticketmod00000000001';

DELETE FROM "AssignmentModule"
WHERE "id" = 'cexitticketmod00000000001';

DELETE FROM "AssignmentTypeImage"
WHERE "assignmentTypeId" = 'cexitticket000000000000000';

DELETE FROM "AssignmentType"
WHERE "id" = 'cexitticket000000000000000'
  AND "kind" = 'exit_ticket'
  AND NOT EXISTS (
    SELECT 1 FROM "Assignment" a
    WHERE a."assignmentTypeId" = 'cexitticket000000000000000'
  );
