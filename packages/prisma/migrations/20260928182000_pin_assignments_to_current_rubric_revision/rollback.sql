-- Full rollback: clear pins from audit table, remove auto/baseline-created revisions,
-- reset pointers, drop baseline/backfill tables, and restore original pin trigger.
-- Idempotent and safe to re-run.
DO $rb$
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

    -- Clear pins recorded by the backfill audit table (assignments pinned by #383).
    UPDATE "Assignment" a
    SET "rubricRevisionId" = NULL
    WHERE EXISTS (
      SELECT 1 FROM "InternalAssignmentRubricPinBackfill" b
      WHERE b."assignmentId" = a.id
        AND b."selectedRevisionId" IS NOT NULL
    );
    -- Also clear auto-pins that happened after deploy: pins to baseline/auto-created revisions
    -- but only for assignments not present in the audit table.
    UPDATE "Assignment" a
    SET "rubricRevisionId" = NULL
    WHERE a."rubricRevisionId" IN (
      SELECT id FROM "RubricRevision" WHERE "createdBy" IN ('baseline-capture','auto-revision')
    )
      AND NOT EXISTS (
        SELECT 1 FROM "InternalAssignmentRubricPinBackfill" b
        WHERE b."assignmentId" = a.id
      );

    -- 3) Restore currentRevisionId to its prior value when it was moved by baseline/auto flows.
    -- If no prior value was recorded, clear only pointers that target baseline/auto-created revisions.
    -- Prefer restore table when present.
    DO $restore$
    BEGIN
      IF to_regclass('public."InternalRubricCurrentPointerRestore"') IS NOT NULL THEN
        UPDATE "Rubric" r
        SET "currentRevisionId" = irpr."previousRevisionId"
        FROM "InternalRubricCurrentPointerRestore" irpr
        WHERE irpr."rubricId" = r.id;
      END IF;
      UPDATE "Rubric" r
      SET "currentRevisionId" = NULL
      WHERE r."currentRevisionId" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "RubricRevision" rr
          WHERE rr.id = r."currentRevisionId"
            AND rr."createdBy" IN ('baseline-capture','auto-revision')
        )
        AND NOT EXISTS (
          SELECT 1 FROM "InternalRubricCurrentPointerRestore" ir
          WHERE ir."rubricId" = r.id
        );
    END
    $restore$;

    -- 4) Drop baseline/backfill tables first to avoid FK violations.
    DROP TABLE IF EXISTS "AssignmentTypeRubricBaseline";
    DROP TABLE IF EXISTS "InternalAssignmentRubricPinBackfill";
    DROP TABLE IF EXISTS "InternalRubricCurrentPointerRestore";

    -- 5) Delete revisions created by baseline/auto rewriters (temporarily relax immutability).
    BEGIN
      DROP TRIGGER IF EXISTS rubric_revision_immutable ON "RubricRevision";
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    DELETE FROM "RubricRevision" WHERE "createdBy" IN ('baseline-capture','auto-revision');
    -- restore immutability guard
    CREATE TRIGGER rubric_revision_immutable BEFORE UPDATE OR DELETE ON "RubricRevision"
    FOR EACH ROW EXECUTE FUNCTION internal_impersonation_audit_append_only();

    -- 6) Remove auto-revision triggers/functions introduced by the baseline capture.
    DROP TRIGGER IF EXISTS yawp_auto_rubric_revision_on_update ON "Rubric";
    DROP FUNCTION IF EXISTS yawp_auto_rubric_revision_on_update();
    DROP TRIGGER IF EXISTS yawp_auto_assignment_type_baseline_on_update ON "AssignmentType";
    DROP FUNCTION IF EXISTS yawp_auto_assignment_type_baseline_on_update();
    -- Drop canonical JSON helper if present
    DROP FUNCTION IF EXISTS canonical_json(jsonb);

    -- 7) Re-enable (or recreate) the original pin trigger function/trigger (library-only behavior).
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
    -- 8) Allow migrations to re-apply by removing these two migration receipts.
    DELETE FROM "_prisma_migrations"
   WHERE "migration_name" IN ('20260928182000_pin_assignments_to_current_rubric_revision',
                              '20260929034000_assignment_rubric_baseline_capture');
  END IF;
END $rb$;

