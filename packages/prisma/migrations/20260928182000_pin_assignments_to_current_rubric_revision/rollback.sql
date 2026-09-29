-- Full rollback: clear pins from audit table, remove auto/baseline-created revisions,
-- reset pointers, drop baseline/backfill tables, and restore original pin trigger.
-- Idempotent and safe to re-run.
DO $$
DECLARE exists_backfill BOOLEAN;
BEGIN
  -- 1) Detect audit table.
  SELECT to_regclass('public."InternalAssignmentRubricPinBackfill"') IS NOT NULL INTO exists_backfill;
  IF NOT exists_backfill THEN
    RAISE NOTICE 'No InternalAssignmentRubricPinBackfill audit table found; nothing to roll back.';
  ELSE
    -- 2) Temporarily disable pin immutability to clear pins.
    BEGIN
      ALTER TABLE "Assignment" DISABLE TRIGGER "internal_assignment_rubric_pin";
    EXCEPTION WHEN undefined_object THEN NULL;
    END;

    UPDATE "Assignment" a
    SET "rubricRevisionId" = NULL
    FROM "InternalAssignmentRubricPinBackfill" i
    WHERE a.id = i."assignmentId";

    -- 3) Reset currentRevisionId when it points to baseline/auto-created revisions.
    UPDATE "Rubric" r
    SET "currentRevisionId" = NULL
    WHERE r."currentRevisionId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "RubricRevision" rr
        WHERE rr.id = r."currentRevisionId"
          AND rr."createdBy" IN ('baseline-capture','auto-revision')
      );

    -- 4) Delete revisions created by baseline/auto rewriters (temporarily relax immutability).
    BEGIN
      DROP TRIGGER IF EXISTS rubric_revision_immutable ON "RubricRevision";
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    DELETE FROM "RubricRevision" WHERE "createdBy" IN ('baseline-capture','auto-revision');
    -- restore immutability guard
    CREATE TRIGGER rubric_revision_immutable BEFORE UPDATE OR DELETE ON "RubricRevision"
    FOR EACH ROW EXECUTE FUNCTION internal_impersonation_audit_append_only();

    -- 5) Drop baseline/backfill tables if present.
    DROP TABLE IF EXISTS "AssignmentTypeRubricBaseline";
    DROP TABLE IF EXISTS "InternalAssignmentRubricPinBackfill";

    -- 6) Re-enable (or recreate) the original pin trigger function/trigger (library-only behavior).
    CREATE OR REPLACE FUNCTION internal_assignment_rubric_pin() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE current_revision TEXT; selected_name TEXT;
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD."rubricRevisionId" IS NOT NULL THEN
        IF NEW."rubricRevisionId" IS DISTINCT FROM OLD."rubricRevisionId" OR NEW."assignmentTypeId" IS DISTINCT FROM OLD."assignmentTypeId" THEN
          RAISE EXCEPTION 'Assignment rubric pin is immutable';
        END IF;
        RETURN NEW;
      END IF;
      SELECT r."currentRevisionId", r.name INTO current_revision, selected_name
      FROM "AssignmentType" t JOIN "Rubric" r ON t."rubricId" = r.id
      WHERE t.id = NEW."assignmentTypeId" FOR SHARE OF r, t;
      IF NEW."rubricRevisionId" IS NULL THEN NEW."rubricRevisionId" := current_revision;
      ELSE
        IF NOT EXISTS (SELECT 1 FROM "RubricRevision" WHERE id = NEW."rubricRevisionId" AND "rubricName" = selected_name) THEN
          RAISE EXCEPTION 'Assignment rubric pin does not match its rubric';
        END IF;
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS internal_assignment_rubric_pin ON "Assignment";
    CREATE TRIGGER internal_assignment_rubric_pin BEFORE INSERT OR UPDATE ON "Assignment"
    FOR EACH ROW EXECUTE FUNCTION internal_assignment_rubric_pin();
  END IF;
END $$;

