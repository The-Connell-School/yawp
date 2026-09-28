-- Pin existing assignments that grade with a selected library rubric to the
-- historically-correct published revision, if they are not already pinned.
--
-- Safety properties:
-- - Only assignments whose assignment type has an explicit library rubric
--   selected (AssignmentType.rubricId) are affected.
-- - Only assignments with a NULL rubricRevisionId are updated.
-- - Only rubrics that have at least one published revision are used for pinning.
--
-- This preserves historical grading semantics for existing work when a new
-- rubric revision is published later: new assignments will follow the new
-- current revision, while historical assignments remain on the revision
-- that was in effect when they were created (or the first captured legacy
-- revision, if they predate the first publication).
--
-- Implementation notes:
-- - Choose the revision based on assignment.createdAt:
--   • If any revision existed at or before assignment.createdAt, pick the
--     latest such revision.
--   • Otherwise (assignment predates first publication), pick the earliest
--     revision for that rubric (the captured legacy snapshot on first publish).
-- - Run in small batches to keep row-level locks short on large tables.
--
-- For auditability and rollback, record which assignments this migration pins.
CREATE TABLE IF NOT EXISTS "InternalAssignmentRubricPinBackfill" (
  "assignmentId" TEXT PRIMARY KEY,
  "selectedRevisionId" TEXT NOT NULL,
  "pinnedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
DECLARE
  rows_changed integer := 0;
BEGIN
  LOOP
    CREATE TEMP TABLE IF NOT EXISTS "__tmp_assignment_rubric_pin_batch" (
      assignment_id TEXT PRIMARY KEY,
      selected_revision_id TEXT NOT NULL
    ) ON COMMIT DROP;
    TRUNCATE TABLE "__tmp_assignment_rubric_pin_batch";

    INSERT INTO "__tmp_assignment_rubric_pin_batch" (assignment_id, selected_revision_id)
    SELECT
      a.id AS assignment_id,
      COALESCE(
        (
          SELECT rv.id
          FROM "RubricRevision" rv
          WHERE rv."rubricName" = r.name
            AND rv."createdAt" <= a."createdAt"
          ORDER BY rv."createdAt" DESC
          LIMIT 1
        ),
        (
          SELECT rv2.id
          FROM "RubricRevision" rv2
          WHERE rv2."rubricName" = r.name
          ORDER BY rv2."createdAt" ASC
          LIMIT 1
        )
      ) AS selected_revision_id
    FROM "Assignment" a
    JOIN "AssignmentType" t ON t.id = a."assignmentTypeId"
    JOIN "Rubric" r ON r.id = t."rubricId"
    WHERE a."rubricRevisionId" IS NULL
      AND EXISTS (
        SELECT 1 FROM "RubricRevision" rx WHERE rx."rubricName" = r.name
      )
    ORDER BY a.id
    LIMIT 1000;

    UPDATE "Assignment" a
    SET "rubricRevisionId" = b.selected_revision_id
    FROM "__tmp_assignment_rubric_pin_batch" b
    WHERE a.id = b.assignment_id;
    GET DIAGNOSTICS rows_changed = ROW_COUNT;

    INSERT INTO "InternalAssignmentRubricPinBackfill" ("assignmentId", "selectedRevisionId")
    SELECT assignment_id, selected_revision_id FROM "__tmp_assignment_rubric_pin_batch"
    ON CONFLICT ("assignmentId") DO NOTHING;
    EXIT WHEN rows_changed = 0;
  END LOOP;
END $$;
