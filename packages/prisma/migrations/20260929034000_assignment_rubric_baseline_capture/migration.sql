SET lock_timeout = '5s';

-- Runbook (lock_timeout recovery):
-- If migrate deploy fails due to lock_timeout during this migration:
-- 1) prisma migrate resolve --rolled-back 20260929034000_assignment_rubric_baseline_capture
-- 2) prisma migrate deploy
-- Notes:
-- - Application queries touching Assignment can queue for up to ~5s during this migration.
-- - canonical_json number formatting differs from JS for very large values (> 2^53), 1e21, and -0.

-- Canonical JSON fingerprinting to match app's JSON.stringify semantics:
-- - Objects: keys sorted in byte-wise "C" collation; no whitespace
-- - Arrays: preserve order
-- - Strings: escape via to_jsonb(text)::text
-- - Numbers: minimal representation (1.0 -> 1, 0.50 -> 0.5)
-- This function is kept because triggers below depend on it; rollback drops it.
CREATE OR REPLACE FUNCTION canonical_json(p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
DECLARE
  out text;
  k text;
  v jsonb;
  first boolean;
  num_text text;
BEGIN
  IF p_value IS NULL THEN
    RETURN 'null';
  END IF;
  CASE jsonb_typeof(p_value)
    WHEN 'null' THEN
      RETURN 'null';
    WHEN 'boolean' THEN
      RETURN p_value::text;
    WHEN 'number' THEN
      -- Parse as numeric to trim trailing zeros; emit minimal string form
      num_text := ((p_value #>> '{}')::numeric)::text;
      RETURN num_text;
    WHEN 'string' THEN
      -- Quote and escape using JSON rules
      RETURN to_jsonb(p_value #>> '{}')::text;
    WHEN 'array' THEN
      out := '[';
      first := true;
      FOR v IN SELECT value FROM jsonb_array_elements(p_value) LOOP
        IF NOT first THEN
          out := out || ',';
        END IF;
        out := out || canonical_json(v);
        first := false;
      END LOOP;
      out := out || ']';
      RETURN out;
    WHEN 'object' THEN
      out := '{';
      first := true;
      FOR k, v IN
        SELECT key, value
        FROM jsonb_each(p_value)
        ORDER BY key COLLATE "C"
      LOOP
        IF NOT first THEN
          out := out || ',';
        END IF;
        out := out || to_jsonb(k)::text || ':' || canonical_json(v);
        first := false;
      END LOOP;
      out := out || '}';
      RETURN out;
  END CASE;
  -- Should be unreachable
  RETURN p_value::text;
END
$$;

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

-- Track prior rubric current pointers so rollback can restore publisher pins
CREATE TABLE IF NOT EXISTS "InternalRubricCurrentPointerRestore" (
  "rubricId" TEXT PRIMARY KEY REFERENCES "Rubric"("id") ON DELETE CASCADE,
  "previousRevisionId" TEXT
);

-- Backfill audit table enhancements: permit reason and null selected id for code-default rows.
ALTER TABLE "InternalAssignmentRubricPinBackfill" ADD COLUMN IF NOT EXISTS "reason" TEXT;
DO $$ BEGIN
  ALTER TABLE "InternalAssignmentRubricPinBackfill" ALTER COLUMN "selectedRevisionId" DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN
  -- Table may not exist yet; creation below will include nullable column.
  NULL;
END $$;
CREATE TABLE IF NOT EXISTS "InternalAssignmentRubricPinBackfill" (
  "assignmentId" TEXT PRIMARY KEY,
  "selectedRevisionId" TEXT,
  "pinnedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT
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
  FOR SHARE OF t;

  -- Fallback: per-type baseline mapping.
  IF current_revision IS NULL THEN
    SELECT b."rubricRevisionId", rv."rubricName" INTO current_revision, selected_name
    FROM "AssignmentTypeRubricBaseline" b
    JOIN "RubricRevision" rv ON rv.id = b."rubricRevisionId"
    WHERE b."assignmentTypeId" = NEW."assignmentTypeId"
    ;
  END IF;
  -- Final fallback: resolve per-type baseline directly by name+schema when mapping is missing.
  IF current_revision IS NULL THEN
    SELECT rr.id, rr."rubricName" INTO current_revision, selected_name
    FROM "AssignmentType" t
    JOIN "RubricRevision" rr
      ON rr."rubricName" = ('assignment-type:' || t.id)
     AND rr."schemaJson" = jsonb_build_object(
           'name', ('assignment-type:' || t.id),
           'title', COALESCE(t.title, ('assignment-type:' || t.id)),
           'scoringScale', COALESCE(t."scoringScaleJson",'{}'::jsonb),
           'rubric', COALESCE(t."rubricJson",'{}'::jsonb),
           'promptConfig', COALESCE(t."gradingPromptConfigJson",'{}'::jsonb),
           'outputSchema', COALESCE(t."gradingOutputSchemaJson",'{}'::jsonb),
           'calibrationNotes', COALESCE(to_jsonb(t."gradingCalibrationNotes"), 'null'::jsonb)
         )
    WHERE t.id = NEW."assignmentTypeId";
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
  -- Library-linked types in use, with a baseline revision absent.
  WITH lib_types AS (
    SELECT DISTINCT t.id AS assignment_type_id, r.name AS rubric_name, r."schemaJson" AS schema_json
    FROM "AssignmentType" t
    JOIN "Rubric" r ON r.id = t."rubricId"
    WHERE EXISTS (SELECT 1 FROM "Assignment" a WHERE a."assignmentTypeId" = t.id)
  ), lib_rubrics AS (
    -- Deduplicate per rubric to avoid concurrent inserts for the same (rubricName, version)
    SELECT DISTINCT rubric_name, schema_json FROM lib_types
  ), lib_missing AS (
    SELECT lr.*, COALESCE((SELECT MAX(version) FROM "RubricRevision" WHERE "rubricName" = lr.rubric_name), 0) + 1 AS next_version
    FROM lib_rubrics lr
  ), lib_created AS (
    INSERT INTO "RubricRevision" ("id","rubricName","version","schemaJson","fingerprint","requestId","requestHash","createdBy","reason")
    SELECT
      gen_random_uuid()::text AS id,
      m.rubric_name,
      m.next_version,
      m.schema_json,
      encode(sha256(convert_to(canonical_json(m.schema_json),'UTF8')),'hex') AS fingerprint,
      gen_random_uuid()::text AS requestId,
      encode(sha256(convert_to(canonical_json(m.schema_json),'UTF8')),'hex') AS requestHash,
      'baseline-capture' AS createdBy,
      'Captured baseline at deployment' AS reason
    FROM lib_missing m
    WHERE NOT EXISTS (
      SELECT 1 FROM "RubricRevision" rr WHERE rr."rubricName" = m.rubric_name AND rr."schemaJson" = m.schema_json
    )
    ON CONFLICT ("rubricName","version") DO NOTHING
  ), lib_rev AS (
    -- Resolve the revision id for each rubric (inserted above or pre-existing)
    SELECT rr.id, rr."rubricName" FROM lib_rubrics lr
    JOIN "RubricRevision" rr ON rr."rubricName" = lr.rubric_name AND rr."schemaJson" = lr.schema_json
  ), lib_map AS (
    INSERT INTO "AssignmentTypeRubricBaseline" ("assignmentTypeId","rubricRevisionId")
    SELECT DISTINCT l.assignment_type_id, r.id
    FROM lib_types l
    JOIN lib_rev r ON r."rubricName" = l.rubric_name
    ON CONFLICT ("assignmentTypeId") DO NOTHING
  ), restore AS (
    INSERT INTO "InternalRubricCurrentPointerRestore" ("rubricId","previousRevisionId")
    SELECT rub.id, rub."currentRevisionId"
    FROM "Rubric" rub
    JOIN "RubricRevision" rr ON rr."rubricName" = rub.name AND rr."schemaJson" = rub."schemaJson"
    WHERE rub."currentRevisionId" IS NOT NULL
      AND rub."currentRevisionId" <> rr.id
    ON CONFLICT ("rubricId") DO NOTHING
    RETURNING 1
  )
  UPDATE "Rubric" rub
  SET "currentRevisionId" = rr.id
  FROM "RubricRevision" rr
  WHERE rr."rubricName" = rub.name
    AND rr."schemaJson" = rub."schemaJson"
    AND (rub."currentRevisionId" IS NULL OR rub."currentRevisionId" <> rr.id);

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
      AND (t."rubricJson" IS NOT NULL OR t."scoringScaleJson" IS NOT NULL)
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
      encode(sha256(convert_to(canonical_json(m.schema_json),'UTF8')),'hex') AS fingerprint,
      gen_random_uuid()::text AS requestId,
      encode(sha256(convert_to(canonical_json(m.schema_json),'UTF8')),'hex') AS requestHash,
      'baseline-capture' AS createdBy,
      'Captured per-type baseline at deployment' AS reason
    FROM per_missing m
    WHERE NOT EXISTS (
      SELECT 1 FROM "RubricRevision" rr WHERE rr."rubricName" = m.rubric_name AND rr."schemaJson" = m.schema_json
    )
    ON CONFLICT ("rubricName","version") DO NOTHING
  ), per_rev AS (
    SELECT rr.id, rr."rubricName" FROM per_types p
    JOIN "RubricRevision" rr ON rr."rubricName" = p.rubric_name AND rr."schemaJson" = p.schema_json
  )
  INSERT INTO "AssignmentTypeRubricBaseline" ("assignmentTypeId","rubricRevisionId")
  SELECT DISTINCT p.assignment_type_id, r.id
  FROM per_types p
  JOIN per_rev r ON r."rubricName" = p.rubric_name
  ON CONFLICT ("assignmentTypeId") DO NOTHING;

  -- 5) Pin existing assignments to their baseline (library or per-type).
  -- Temporarily disable immutability to perform the one-time backfill safely.
  ALTER TABLE "Assignment" DISABLE TRIGGER "internal_assignment_rubric_pin";
  LOOP
    CREATE TEMP TABLE IF NOT EXISTS "__tmp_pin_assignments_batch" (
      assignment_id TEXT PRIMARY KEY,
      selected_revision_id TEXT NOT NULL
    ) ON COMMIT DROP;
    TRUNCATE TABLE "__tmp_pin_assignments_batch";

    INSERT INTO "__tmp_pin_assignments_batch"(assignment_id, selected_revision_id)
    SELECT a.id, sr.selected_revision_id
    FROM "Assignment" a
    JOIN LATERAL (
      SELECT COALESCE(
        -- Prefer library current revision when present
        (SELECT r."currentRevisionId"
         FROM "AssignmentType" t JOIN "Rubric" r ON r.id = t."rubricId"
         WHERE t.id = a."assignmentTypeId"),
        -- Fallback to baseline mapping (per-type or library)
        (SELECT b."rubricRevisionId" FROM "AssignmentTypeRubricBaseline" b WHERE b."assignmentTypeId" = a."assignmentTypeId"),
        -- Final fallback: resolve per-type baseline directly by name+schema when mapping is missing
        (SELECT rr.id
         FROM "AssignmentType" t
         JOIN "RubricRevision" rr
           ON rr."rubricName" = ('assignment-type:' || t.id)
          AND rr."schemaJson" = jsonb_build_object(
                'name', ('assignment-type:' || t.id),
                'title', COALESCE(t.title, ('assignment-type:' || t.id)),
                'scoringScale', COALESCE(t."scoringScaleJson",'{}'::jsonb),
                'rubric', COALESCE(t."rubricJson",'{}'::jsonb),
                'promptConfig', COALESCE(t."gradingPromptConfigJson",'{}'::jsonb),
                'outputSchema', COALESCE(t."gradingOutputSchemaJson",'{}'::jsonb),
                'calibrationNotes', COALESCE(to_jsonb(t."gradingCalibrationNotes"), 'null'::jsonb)
              )
         WHERE t.id = a."assignmentTypeId")
      ) AS selected_revision_id
    ) AS sr ON TRUE
    WHERE a."rubricRevisionId" IS NULL
      AND sr.selected_revision_id IS NOT NULL
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
  ALTER TABLE "Assignment" ENABLE TRIGGER "internal_assignment_rubric_pin";

  -- Record unpinned assignments that deliberately remain on code defaults.
  INSERT INTO "InternalAssignmentRubricPinBackfill" ("assignmentId","selectedRevisionId","reason")
  SELECT a.id, NULL, 'code-default'
  FROM "Assignment" a
  JOIN "AssignmentType" t ON t.id = a."assignmentTypeId"
  WHERE a."rubricRevisionId" IS NULL
    AND t."rubricId" IS NULL
    AND t."rubricJson" IS NULL
    AND t."scoringScaleJson" IS NULL
  ON CONFLICT ("assignmentId") DO NOTHING;
END $$;

-- 6) Auto-revision on updates to library rubrics (captures new immutable revision and advances current pointer).
CREATE OR REPLACE FUNCTION yawp_auto_rubric_revision_on_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_version INT; new_id TEXT;
BEGIN
  IF NEW."schemaJson" IS NOT DISTINCT FROM OLD."schemaJson" THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version FROM "RubricRevision" WHERE "rubricName" = NEW.name;
  SELECT gen_random_uuid()::text INTO new_id;
  INSERT INTO "RubricRevision" ("id","rubricName","version","schemaJson","fingerprint","requestId","requestHash","createdBy","reason")
  VALUES (
    new_id, NEW.name, next_version, NEW."schemaJson",
    encode(sha256(convert_to(canonical_json(NEW."schemaJson"),'UTF8')),'hex'),
    gen_random_uuid()::text, encode(sha256(convert_to(canonical_json(NEW."schemaJson"),'UTF8')),'hex'),
    'auto-revision', 'Rubric updated'
  );
  NEW."currentRevisionId" := new_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS yawp_auto_rubric_revision_on_update ON "Rubric";
CREATE TRIGGER yawp_auto_rubric_revision_on_update
BEFORE UPDATE OF "schemaJson" ON "Rubric"
FOR EACH ROW EXECUTE FUNCTION yawp_auto_rubric_revision_on_update();

-- 7) Auto-baseline on updates to per-type grading JSON (captures new immutable per-type revision and updates baseline).
CREATE OR REPLACE FUNCTION yawp_auto_assignment_type_baseline_on_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_version INT; new_id TEXT; rubric_name TEXT; schema_json JSONB;
BEGIN
  IF NEW."rubricId" IS NOT NULL THEN
    RETURN NEW; -- library-linked: handled by rubric update
  END IF;
  IF (NEW."scoringScaleJson" IS NOT DISTINCT FROM OLD."scoringScaleJson")
     AND (NEW."rubricJson" IS NOT DISTINCT FROM OLD."rubricJson")
     AND (NEW."gradingPromptConfigJson" IS NOT DISTINCT FROM OLD."gradingPromptConfigJson")
     AND (NEW."gradingOutputSchemaJson" IS NOT DISTINCT FROM OLD."gradingOutputSchemaJson")
     AND (NEW."gradingCalibrationNotes" IS NOT DISTINCT FROM OLD."gradingCalibrationNotes") THEN
    RETURN NEW;
  END IF;
  -- Skip types with no rubric JSON source at all.
  IF NEW."scoringScaleJson" IS NULL AND NEW."rubricJson" IS NULL THEN
    RETURN NEW;
  END IF;
  rubric_name := 'assignment-type:' || NEW.id;
  schema_json := jsonb_build_object(
    'name', rubric_name,
    'title', COALESCE(NEW.title, rubric_name),
    'scoringScale', COALESCE(NEW."scoringScaleJson",'{}'::jsonb),
    'rubric', COALESCE(NEW."rubricJson",'{}'::jsonb),
    'promptConfig', COALESCE(NEW."gradingPromptConfigJson",'{}'::jsonb),
    'outputSchema', COALESCE(NEW."gradingOutputSchemaJson",'{}'::jsonb),
    'calibrationNotes', COALESCE(to_jsonb(NEW."gradingCalibrationNotes"), 'null'::jsonb)
  );
  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version FROM "RubricRevision" WHERE "rubricName" = rubric_name;
  SELECT gen_random_uuid()::text INTO new_id;
  INSERT INTO "RubricRevision" ("id","rubricName","version","schemaJson","fingerprint","requestId","requestHash","createdBy","reason")
  VALUES (
    new_id, rubric_name, next_version, schema_json,
    encode(sha256(convert_to(canonical_json(schema_json),'UTF8')),'hex'),
    gen_random_uuid()::text, encode(sha256(convert_to(canonical_json(schema_json),'UTF8')),'hex'),
    'auto-revision', 'Assignment type rubric updated'
  )
  ON CONFLICT DO NOTHING;
  INSERT INTO "AssignmentTypeRubricBaseline" ("assignmentTypeId","rubricRevisionId")
  VALUES (NEW.id, new_id)
  ON CONFLICT ("assignmentTypeId") DO UPDATE SET "rubricRevisionId" = EXCLUDED."rubricRevisionId";
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS yawp_auto_assignment_type_baseline_on_update ON "AssignmentType";
CREATE TRIGGER yawp_auto_assignment_type_baseline_on_update
BEFORE UPDATE OF "scoringScaleJson","rubricJson","gradingPromptConfigJson","gradingOutputSchemaJson","gradingCalibrationNotes" ON "AssignmentType"
FOR EACH ROW EXECUTE FUNCTION yawp_auto_assignment_type_baseline_on_update();
 
RESET lock_timeout;
