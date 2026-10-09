-- Let the existing rubric revision triggers record who saved a version and why.
--
-- The functions below are identical to the ones created by
-- 20260929034000_assignment_rubric_baseline_capture except that createdBy,
-- reason, requestId and requestHash may be supplied by the writer through
-- transaction-local settings (set_config(..., true)):
--   yawp.rubric_revision_actor, yawp.rubric_revision_reason,
--   yawp.rubric_revision_request_id, yawp.rubric_revision_request_hash
-- When they are unset the previous values are used ('auto-revision', the old
-- reason text, a random request id, the content fingerprint), so every other
-- writer behaves exactly as before. No table or row is touched.
-- Rollback: rollback.sql restores the previous function bodies.

CREATE OR REPLACE FUNCTION yawp_auto_rubric_revision_on_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_version INT; new_id TEXT; fp TEXT;
BEGIN
  IF NEW."schemaJson" IS NOT DISTINCT FROM OLD."schemaJson" THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version FROM "RubricRevision" WHERE "rubricName" = NEW.name;
  SELECT gen_random_uuid()::text INTO new_id;
  fp := encode(sha256(convert_to(canonical_json(NEW."schemaJson"),'UTF8')),'hex');
  INSERT INTO "RubricRevision" ("id","rubricName","version","schemaJson","fingerprint","requestId","requestHash","createdBy","reason")
  VALUES (
    new_id, NEW.name, next_version, NEW."schemaJson", fp,
    COALESCE(NULLIF(current_setting('yawp.rubric_revision_request_id', true), ''), gen_random_uuid()::text),
    COALESCE(NULLIF(current_setting('yawp.rubric_revision_request_hash', true), ''), fp),
    COALESCE(NULLIF(current_setting('yawp.rubric_revision_actor', true), ''), 'auto-revision'),
    COALESCE(NULLIF(current_setting('yawp.rubric_revision_reason', true), ''), 'Rubric updated')
  );
  NEW."currentRevisionId" := new_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION yawp_auto_assignment_type_baseline_on_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_version INT; new_id TEXT; rubric_name TEXT; schema_json JSONB; fp TEXT;
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
  fp := encode(sha256(convert_to(canonical_json(schema_json),'UTF8')),'hex');
  INSERT INTO "RubricRevision" ("id","rubricName","version","schemaJson","fingerprint","requestId","requestHash","createdBy","reason")
  VALUES (
    new_id, rubric_name, next_version, schema_json, fp,
    COALESCE(NULLIF(current_setting('yawp.rubric_revision_request_id', true), ''), gen_random_uuid()::text),
    COALESCE(NULLIF(current_setting('yawp.rubric_revision_request_hash', true), ''), fp),
    COALESCE(NULLIF(current_setting('yawp.rubric_revision_actor', true), ''), 'auto-revision'),
    COALESCE(NULLIF(current_setting('yawp.rubric_revision_reason', true), ''), 'Assignment type rubric updated')
  )
  ON CONFLICT DO NOTHING;
  INSERT INTO "AssignmentTypeRubricBaseline" ("assignmentTypeId","rubricRevisionId")
  VALUES (NEW.id, new_id)
  ON CONFLICT ("assignmentTypeId") DO UPDATE SET "rubricRevisionId" = EXCLUDED."rubricRevisionId";
  RETURN NEW;
END $$;