-- Baseline-capture the current grading rubric for every assignment type in use,
-- pin all existing assignments to that immutable baseline, and make new
-- assignments pin automatically even when a type grades from per-type JSON.
--
-- Idempotent: safe to re-run. Reversible via rollback.sql in the prior
-- backfill directory; audit table records per-assignment pins.
--
-- 1) Mapping for per-type baselines
CREATE TABLE IF NOT EXISTS "AssignmentTypeRubricBaseline" (
  "assignmentTypeId" TEXT PRIMARY KEY REFERENCES "AssignmentType"("id") ON DELETE CASCADE,
  "rubricRevisionId" TEXT NOT NULL REFERENCES "RubricRevision"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2) Function update: allow baseline fallback for types without a library rubric
DROP TRIGGER IF EXISTS internal_assignment_rubric_pin ON "Assignment";
CREATE OR REPLACE FUNCTION internal_assignment_rubric_pin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_revision TEXT; selected_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."rubricRevisionId" IS NOT NULL THEN
    IF NEW."rubricRevisionId" IS DISTINCT FROM OLD."rubricRevisionId" OR NEW."assignmentTypeId" IS DISTINCT FROM OLD."assignmentTypeId" THEN
      RAISE EXCEPTION 'Assignment rubric pin is immutable';
    END IF;
    RETURN NEW;
  END IF;

  -- Prefer library rubric's current revision when present.
  SELECT r."currentRevisionId", r.name INTO current_revision, selected_name
  FROM "AssignmentType" t
  LEFT JOIN "Rubric" r ON t."rubricId" = r.id
  WHERE t.id = NEW."assignmentTypeId"
  FOR SHARE OF t, r;

  -- Fallback: per-type baseline mapping.
  IF current_revision IS NULL THEN
    SELECT b."rubricRevisionId", rv."rubricName" INTO current_revision, selected_name
    FROM "AssignmentTypeRubricBaseline" b
    JOIN "RubricRevision" rv ON rv.id = b."rubricRevisionId"
    WHERE b."assignmentTypeId" = NEW."assignmentTypeId"
    FOR SHARE OF b, rv;
  END IF;

  IF NEW."rubricRevisionId" IS NULL THEN NEW."rubricRevisionId" := current_revision;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM "RubricRevision" WHERE id = NEW."rubricRevisionId" AND "rubricName" = selected_name) THEN
      RAISE EXCEPTION 'Assignment rubric pin does not match its rubric';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER internal_assignment_rubric_pin BEFORE INSERT OR UPDATE ON "Assignment"
FOR EACH ROW EXECUTE FUNCTION internal_assignment_rubric_pin();

-- 3) Baseline-capture for library-linked types that have assignments and no pinned rows.
DO $$
DECLARE
  rows_changed integer := 0;
BEGIN
  -- Ensure pgcrypto is available for digest/uuid helpers.
  PERFORM 1 FROM pg_extension WHERE extname = 'pgcrypto';
  IF NOT FOUND THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  END IF;

  -- Library-linked types in use, with a baseline revision absent.
  WITH lib_types AS (
    SELECT DISTINCT t.id AS assignment_type_id, r.name AS rubric_name, r.schemaJson AS schema_json
    FROM "AssignmentType" t
    JOIN "Rubric" r ON r.id = t."rubricId"
    WHERE EXISTS (SELECT 1 FROM "Assignment" a WHERE a."assignmentTypeId" = t.id)
  ), lib_missing AS (
    SELECT l.*, COALESCE((SELECT MAX(version) FROM "RubricRevision" WHERE "rubricName" = l.rubric_name), 0) + 1 AS next_version
    FROM lib_types l
  ), lib_created AS (
    INSERT INTO "RubricRevision" ("id","rubricName","version","schemaJson","fingerprint","requestId","requestHash","createdBy","reason")
    SELECT
      gen_random_uuid()::text AS id,
      m.rubric_name,
      m.next_version,
      m.schema_json,
      encode(digest(m.schema_json::text, 'sha256'), 'hex') AS fingerprint,
      gen_random_uuid()::text AS requestId,
      encode(digest(m.schema_json::text, 'sha256'), 'hex') AS requestHash,
      'baseline-capture' AS createdBy,
      'Captured baseline at deployment' AS reason
    FROM lib_missing m
    WHERE NOT EXISTS (
      SELECT 1 FROM "RubricRevision" rr WHERE rr."rubricName" = m.rubric_name AND rr."schemaJson" = m.schema_json
    )
    RETURNING "id","rubricName","version","schemaJson"
  ), lib_rev AS (
    -- Pick the inserted revision when created, otherwise reuse the existing identical row
    SELECT c.id, c."rubricName" AS rubric_name FROM lib_created c
    UNION ALL
    SELECT rr.id, rr."rubricName" FROM lib_types l
    JOIN "RubricRevision" rr ON rr."rubricName" = l.rubric_name AND rr."schemaJson" = l.schema_json
  ), lib_map AS (
    INSERT INTO "AssignmentTypeRubricBaseline" ("assignmentTypeId","rubricRevisionId")
    SELECT DISTINCT l.assignment_type_id, r.id
    FROM lib_types l
    JOIN lib_rev r ON r.rubric_name = l.rubric_name
    ON CONFLICT ("assignmentTypeId") DO NOTHING
    RETURNING "assignmentTypeId","rubricRevisionId"
  )
  UPDATE "Rubric" rub
  SET "currentRevisionId" = r.id
  FROM lib_rev r
  WHERE rub.name = r.rubric_name
    AND (rub."currentRevisionId" IS NULL OR rub."currentRevisionId" <> r.id);

  -- 4) Baseline-capture for per-type rubrics (no library link) that have assignments.
  WITH per_types AS (
    SELECT DISTINCT t.id AS assignment_type_id, t.title,
      jsonb_build_object(
        'name', ('assignment-type:' || t.id),
        'title', t.title,
        'scoringScale', COALESCE(t."scoringScaleJson",'{}'::jsonb),
        'rubric', COALESCE(t."rubricJson",'{}'::jsonb),
        'promptConfig', COALESCE(t."gradingPromptConfigJson",'{}'::jsonb),
        'outputSchema', COALESCE(t."gradingOutputSchemaJson",'{}'::jsonb),
        'calibrationNotes', COALESCE(to_jsonb(t."gradingCalibrationNotes"), 'null'::jsonb)
      ) AS schema_json,
      ('assignment-type:' || t.id) AS rubric_name
    FROM "AssignmentType" t
    WHERE t."rubricId" IS NULL
      AND EXISTS (SELECT 1 FROM "Assignment" a WHERE a."assignmentTypeId" = t.id)
  ), per_missing AS (
    SELECT p.*, COALESCE((SELECT MAX(version) FROM "RubricRevision" WHERE "rubricName" = p.rubric_name), 0) + 1 AS next_version
    FROM per_types p
  ), per_created AS (
    INSERT INTO "RubricRevision" ("id","rubricName","version","schemaJson","fingerprint","requestId","requestHash","createdBy","reason")
    SELECT
      gen_random_uuid()::text AS id,
      m.rubric_name,
      m.next_version,
      m.schema_json,
      encode(digest(m.schema_json::text, 'sha256'), 'hex') AS fingerprint,
      gen_random_uuid()::text AS requestId,
      encode(digest(m.schema_json::text, 'sha256'), 'hex') AS requestHash,
      'baseline-capture' AS createdBy,
      'Captured per-type baseline at deployment' AS reason
    FROM per_missing m
    WHERE NOT EXISTS (
      SELECT 1 FROM "RubricRevision" rr WHERE rr."rubricName" = m.rubric_name AND rr."schemaJson" = m.schema_json
    )
    RETURNING "id","rubricName","version","schemaJson"
  ), per_rev AS (
    SELECT c.id, c."rubricName" AS rubric_name FROM per_created c
    UNION ALL
    SELECT rr.id, rr."rubricName" FROM per_types p
    JOIN "RubricRevision" rr ON rr."rubricName" = p.rubric_name AND rr."schemaJson" = p.schema_json
  )
  INSERT INTO "AssignmentTypeRubricBaseline" ("assignmentTypeId","rubricRevisionId")
  SELECT DISTINCT p.assignment_type_id, r.id
  FROM per_types p
  JOIN per_rev r ON r.rubric_name = p.rubric_name
  ON CONFLICT ("assignmentTypeId") DO NOTHING;

  -- 5) Pin existing assignments to their baseline (library or per-type).
  LOOP
    CREATE TEMP TABLE IF NOT EXISTS "__tmp_pin_assignments_batch" (
      assignment_id TEXT PRIMARY KEY,
      selected_revision_id TEXT NOT NULL
    ) ON COMMIT DROP;
    TRUNCATE TABLE "__tmp_pin_assignments_batch";

    INSERT INTO "__tmp_pin_assignments_batch"(assignment_id, selected_revision_id)
    SELECT a.id,
      COALESCE(
        -- Prefer library current revision when present
        (SELECT r."currentRevisionId"
         FROM "AssignmentType" t JOIN "Rubric" r ON r.id = t."rubricId"
         WHERE t.id = a."assignmentTypeId"),
        -- Fallback to baseline mapping (per-type or library)
        (SELECT b."rubricRevisionId" FROM "AssignmentTypeRubricBaseline" b WHERE b."assignmentTypeId" = a."assignmentTypeId")
      ) AS selected_revision_id
    FROM "Assignment" a
    WHERE a."rubricRevisionId" IS NULL
      AND EXISTS (
        SELECT 1 FROM "AssignmentTypeRubricBaseline" b WHERE b."assignmentTypeId" = a."assignmentTypeId"
      )
    ORDER BY a.id
    LIMIT 1000;

    UPDATE "Assignment" a
    SET "rubricRevisionId" = b.selected_revision_id
    FROM "__tmp_pin_assignments_batch" b
    WHERE a.id = b.assignment_id;
    GET DIAGNOSTICS rows_changed = ROW_COUNT;

    INSERT INTO "InternalAssignmentRubricPinBackfill" ("assignmentId","selectedRevisionId")
    SELECT assignment_id, selected_revision_id FROM "__tmp_pin_assignments_batch"
    ON CONFLICT ("assignmentId") DO NOTHING;

    EXIT WHEN rows_changed = 0;
  END LOOP;
END $$;

