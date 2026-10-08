-- Roll back after reverting the app deploy, then mark rolled back in Prisma:
--   bun prisma migrate resolve --rolled-back 20261007174800_bootstrap_exit_ticket_assignment_type
--
-- Removes bootstrap org availability and the global type only when no Assignment
-- references exit_ticket. Module/instruction/image deletes run inside the same
-- guard so student AssignmentModuleSession rows are never cascade-deleted while
-- the type is still in use.
--
-- OrganizationAssignmentType rows removed here are exactly those pointing at the
-- bootstrap exit_ticket type (all org grants this migration created).

DO $$
DECLARE
  type_id text;
BEGIN
  SELECT "id" INTO type_id
  FROM "AssignmentType"
  WHERE "kind" = 'exit_ticket'
  LIMIT 1;

  IF type_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Assignment" a WHERE a."assignmentTypeId" = type_id
  ) THEN
    RAISE NOTICE 'exit_ticket rollback skipped: assignments reference this type';
    RETURN;
  END IF;

  DELETE FROM "OrganizationAssignmentType"
  WHERE "assignmentTypeId" = type_id;

  DELETE FROM "AssignmentModuleInstruction" i
  USING "AssignmentModule" m
  WHERE i."assignmentModuleId" = m."id"
    AND m."assignmentTypeId" = type_id;

  DELETE FROM "AssignmentModule"
  WHERE "assignmentTypeId" = type_id;

  DELETE FROM "AssignmentTypeImage"
  WHERE "assignmentTypeId" = type_id;

  DELETE FROM "AssignmentType"
  WHERE "id" = type_id
    AND "kind" = 'exit_ticket';
END $$;
