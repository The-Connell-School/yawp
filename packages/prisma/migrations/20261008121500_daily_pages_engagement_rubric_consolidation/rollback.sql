-- Rollback Daily Pages engagement rubric v2
DO $$
DECLARE
  engagement_id TEXT := 'cmsvqo8lf002801l60o74x8wr';
  daily_pages_type_id TEXT := 'cmlgtyo8j01em0qjs6knw7cni';
  sjp_daily_pages_type_id TEXT := 'cmtk7cy2r017y01l8r5ix4kxf';
  short_form_id TEXT := 'cmumlbxru000001jn1cjqkham';
  reflection_id TEXT := 'cmtuonqfw000101l3ntnz78sj';
  prev JSONB;
  prev_rev TEXT;
  dp_prev_rubric TEXT;
  sjp_prev_rubric TEXT;
BEGIN
  SELECT "previousSchemaJson", "previousCurrentRevisionId",
         "dailyPagesTypePreviousRubricId", "sjpTypePreviousRubricId"
  INTO prev, prev_rev, dp_prev_rubric, sjp_prev_rubric
  FROM "InternalDpEngagementRubricRestore"
  WHERE "rubricId" = engagement_id;

  IF prev IS NULL THEN
    RAISE NOTICE 'No restore row for %', engagement_id;
    RETURN;
  END IF;

  UPDATE "Rubric"
  SET "schemaJson" = prev, "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = engagement_id;

  UPDATE "Rubric"
  SET "currentRevisionId" = NULL, "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = engagement_id;

  UPDATE "AssignmentType"
  SET "rubricId" = dp_prev_rubric, "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = daily_pages_type_id;

  UPDATE "AssignmentType"
  SET "rubricId" = sjp_prev_rubric, "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = sjp_daily_pages_type_id;

  UPDATE "Rubric"
  SET "archivedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
  WHERE id IN (short_form_id, reflection_id)
     OR name IN ('daily-pages-short-form', 'daily-pages-reflection');

  DELETE FROM "InternalAssignmentRubricPinBackfill"
  WHERE reason = 'dp_engagement_v2_pre_publish';
END $$;

DROP TABLE IF EXISTS "InternalDpEngagementRubricRestore";
