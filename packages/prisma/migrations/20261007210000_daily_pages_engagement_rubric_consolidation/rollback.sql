-- Rollback Daily Pages engagement rubric v2
DO $$
DECLARE
  engagement_id TEXT := 'cmsvqo8lf002801l60o74x8wr';
  short_form_id TEXT := 'cmumlbxru000001jn1cjqkham';
  reflection_id TEXT := 'cmtuonqfw000101l3ntnz78sj';
  prev JSONB;
  prev_rev TEXT;
BEGIN
  SELECT "previousSchemaJson", "previousCurrentRevisionId"
  INTO prev, prev_rev
  FROM "InternalDpEngagementRubricRestore"
  WHERE "rubricId" = engagement_id;

  IF prev IS NULL THEN
    RAISE NOTICE 'No restore row for %', engagement_id;
    RETURN;
  END IF;

  UPDATE "Rubric"
  SET "schemaJson" = prev, "currentRevisionId" = prev_rev, "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = engagement_id;

  UPDATE "Rubric"
  SET "archivedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
  WHERE id IN (short_form_id, reflection_id)
     OR name IN ('daily-pages-short-form', 'daily-pages-reflection');

  DELETE FROM "InternalAssignmentRubricPinBackfill"
  WHERE reason = 'dp_engagement_v2_pre_publish';
END $$;

DROP TABLE IF EXISTS "InternalDpEngagementRubricRestore";
