-- Roll back the assignment rubric pin backfill applied by this migration.
-- This clears rubricRevisionId only for the assignments recorded during the
-- backfill run, leaving any pre-existing pins intact.
--
-- Safe to run multiple times; the audit table preserves idempotency.
DO $$
BEGIN
  IF to_regclass('public.InternalAssignmentRubricPinBackfill') IS NULL THEN
    RAISE NOTICE 'No InternalAssignmentRubricPinBackfill audit table found; nothing to roll back.';
    RETURN;
  END IF;

  UPDATE "Assignment" a
  SET "rubricRevisionId" = NULL
  FROM "InternalAssignmentRubricPinBackfill" i
  WHERE a.id = i."assignmentId";
END $$;

