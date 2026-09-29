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

    -- Clear pins only for revisions created by baseline/auto flows.
    UPDATE "Assignment" a
    SET "rubricRevisionId" = NULL
    WHERE a."rubricRevisionId" IN (
      SELECT id FROM "RubricRevision" WHERE "createdBy" IN ('baseline-capture','auto-revision')
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
        );
    END
    $restore$;

    -- Drop auto-revision triggers/functions introduced by the baseline capture early to avoid firing during restores.
    DROP TRIGGER IF EXISTS yawp_auto_rubric_revision_on_update ON "Rubric";
    DROP FUNCTION IF EXISTS yawp_auto_rubric_revision_on_update();
    DROP TRIGGER IF EXISTS yawp_auto_assignment_type_baseline_on_update ON "AssignmentType";
    DROP FUNCTION IF EXISTS yawp_auto_assignment_type_baseline_on_update();

    -- 4) Drop baseline/backfill tables first to avoid FK violations.
    DROP TABLE IF EXISTS "AssignmentTypeRubricBaseline";
    DROP TABLE IF EXISTS "InternalAssignmentRubricPinBackfill";
    DROP TABLE IF EXISTS "InternalRubricCurrentPointerRestore";

    -- 5) Restore library and per-type sources to their pre-migration JSON using captured revisions,
    --    then delete revisions created by baseline/auto rewriters (temporarily relax immutability).
    BEGIN
      DROP TRIGGER IF EXISTS rubric_revision_immutable ON "RubricRevision";
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    -- Restore library rubric schemaJson from the restored current pointer when available
    DO $restore_lib$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'InternalRubricCurrentPointerRestore') THEN
        UPDATE "Rubric" r
        SET "schemaJson" = rr."schemaJson"
        FROM "InternalRubricCurrentPointerRestore" irpr
        JOIN "RubricRevision" rr ON rr.id = irpr."previousRevisionId"
        WHERE irpr."rubricId" = r.id;
      END IF;
    END
    $restore_lib$;
    -- Restore per-type JSON fields from their baseline-capture revision when present
    UPDATE "AssignmentType" t
    SET
      "scoringScaleJson" = COALESCE(rr."schemaJson"->'scoringScale', NULL),
      "rubricJson" = COALESCE(rr."schemaJson"->'rubric', NULL),
      "gradingPromptConfigJson" = COALESCE(rr."schemaJson"->'promptConfig', NULL),
      "gradingOutputSchemaJson" = COALESCE(rr."schemaJson"->'outputSchema', NULL),
      "gradingCalibrationNotes" = CASE
        WHEN COALESCE((rr."schemaJson"->'calibrationNotes')::text, 'null') = 'null' THEN NULL
        ELSE rr."schemaJson"->>'calibrationNotes'
      END
    FROM "RubricRevision" rr
    WHERE rr."rubricName" = ('assignment-type:' || t.id);
    -- Now remove baseline/auto revisions
    DELETE FROM "RubricRevision" WHERE "createdBy" IN ('baseline-capture','auto-revision');
    -- restore immutability guard
    CREATE TRIGGER rubric_revision_immutable BEFORE UPDATE OR DELETE ON "RubricRevision"
    FOR EACH ROW EXECUTE FUNCTION internal_impersonation_audit_append_only();

    -- 6) Remove any remaining auto-revision triggers/functions (redundant safety).
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

