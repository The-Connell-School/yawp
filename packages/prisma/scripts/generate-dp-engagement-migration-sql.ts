/**
 * One-off generator: embeds daily-pages-engagement.json into migration SQL.
 *   bun run packages/prisma/scripts/generate-dp-engagement-migration-sql.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..', '..');
const schemaPath = join(
  ROOT,
  'services/web-app/app/domain/rubrics/library/daily-pages-engagement.json'
);
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
const schemaLiteral = JSON.stringify(schema).replace(/'/g, "''");

const migrationDir = join(
  import.meta.dir,
  '..',
  'migrations',
  '20261007210000_daily_pages_engagement_rubric_consolidation'
);

const sql = `-- Daily Pages engagement rubric v2 (Brian Connell 2026-10-02)
SET lock_timeout = '5s';

ALTER TABLE "Rubric" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ(6);
CREATE INDEX IF NOT EXISTS "Rubric_archivedAt_idx" ON "Rubric"("archivedAt");

CREATE TABLE IF NOT EXISTS "InternalDpEngagementRubricRestore" (
  "rubricId" TEXT PRIMARY KEY REFERENCES "Rubric"("id") ON DELETE CASCADE,
  "previousSchemaJson" JSONB NOT NULL,
  "previousCurrentRevisionId" TEXT,
  "dailyPagesTypePreviousRubricId" TEXT,
  "sjpTypePreviousRubricId" TEXT,
  "archivedShortFormRubricId" TEXT,
  "archivedReflectionRubricId" TEXT,
  "restoredAt" TIMESTAMPTZ(6)
);

DO $$
DECLARE
  engagement_id TEXT := 'cmsvqo8lf002801l60o74x8wr';
  daily_pages_type_id TEXT := 'cmlgtyo8j01em0qjs6knw7cni';
  sjp_daily_pages_type_id TEXT := 'cmtk7cy2r017y01l8r5ix4kxf';
  short_form_id TEXT := 'cmumlbxru000001jn1cjqkham';
  reflection_id TEXT := 'cmtuonqfw000101l3ntnz78sj';
  v2_schema JSONB := '${schemaLiteral}'::jsonb;
  rub_row RECORD;
  dp_prev_rubric TEXT;
  sjp_prev_rubric TEXT;
  v1_id TEXT := 'dp-engagement-library-v1-capture';
  fp TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Rubric" WHERE id = engagement_id) THEN
    RAISE NOTICE 'Skipping DP engagement v2: library rubric % not found', engagement_id;
    RETURN;
  END IF;

  SELECT id, "schemaJson", "currentRevisionId" INTO rub_row
  FROM "Rubric" WHERE id = engagement_id;

  SELECT "rubricId" INTO dp_prev_rubric FROM "AssignmentType" WHERE id = daily_pages_type_id;
  SELECT "rubricId" INTO sjp_prev_rubric FROM "AssignmentType" WHERE id = sjp_daily_pages_type_id;

  INSERT INTO "InternalDpEngagementRubricRestore" (
    "rubricId", "previousSchemaJson", "previousCurrentRevisionId",
    "dailyPagesTypePreviousRubricId", "sjpTypePreviousRubricId",
    "archivedShortFormRubricId", "archivedReflectionRubricId"
  ) VALUES (
    engagement_id, rub_row."schemaJson", rub_row."currentRevisionId",
    dp_prev_rubric, sjp_prev_rubric,
    short_form_id, reflection_id
  )
  ON CONFLICT ("rubricId") DO NOTHING;

  INSERT INTO "InternalAssignmentRubricPinBackfill" ("assignmentId", "selectedRevisionId", "reason")
  SELECT a.id, a."rubricRevisionId", 'dp_engagement_v2_pre_publish'
  FROM "Assignment" a
  WHERE a."rubricRevisionId" IS NOT NULL
    AND a."assignmentTypeId" IN (daily_pages_type_id, sjp_daily_pages_type_id)
  ON CONFLICT ("assignmentId") DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM "RubricRevision" WHERE "rubricName" = 'daily-pages-engagement'
  ) THEN
    fp := encode(sha256(convert_to(canonical_json(rub_row."schemaJson"), 'UTF8')), 'hex');
    INSERT INTO "RubricRevision" (
      "id", "rubricName", "version", "schemaJson", "fingerprint",
      "requestId", "requestHash", "createdBy", "reason"
    ) VALUES (
      v1_id, 'daily-pages-engagement', 1, rub_row."schemaJson", fp,
      'dp-engagement-library-v1-capture', fp,
      'migration-dp-engagement-v2', 'Capture pre-Brian library schema as v1'
    )
    ON CONFLICT ("id") DO NOTHING;
  END IF;

  IF (rub_row."schemaJson"->'outputSchema'->>'assignmentPointScaling' IS DISTINCT FROM 'daily_pages_engagement_v2') THEN
    PERFORM set_config('yawp.rubric_revision_actor', 'migration-dp-engagement-v2', true);
    PERFORM set_config('yawp.rubric_revision_reason', 'Brian 2026-10-02 merged Daily Pages rubric', true);
    IF NOT EXISTS (
      SELECT 1 FROM "RubricRevision" WHERE "requestId" = 'brian-dp-rubric-2026-10-02'
    ) THEN
      PERFORM set_config('yawp.rubric_revision_request_id', 'brian-dp-rubric-2026-10-02', true);
    ELSE
      PERFORM set_config(
        'yawp.rubric_revision_request_id',
        'brian-dp-rubric-2026-10-02-reapply-' || substr(md5(random()::text), 1, 12),
        true
      );
    END IF;

    UPDATE "Rubric"
    SET "schemaJson" = v2_schema, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = engagement_id;
  END IF;

  UPDATE "Rubric"
  SET "archivedAt" = COALESCE("archivedAt", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP
  WHERE id IN (short_form_id, reflection_id)
     OR name IN ('daily-pages-short-form', 'daily-pages-reflection');

  UPDATE "AssignmentType"
  SET "rubricId" = engagement_id, "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = daily_pages_type_id
    AND "rubricId" IS NULL
    AND EXISTS (SELECT 1 FROM "AssignmentType" WHERE id = daily_pages_type_id AND kind = 'daily_pages');

  UPDATE "AssignmentType"
  SET "rubricId" = engagement_id, "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = sjp_daily_pages_type_id
    AND "rubricId" IS NULL
    AND EXISTS (SELECT 1 FROM "AssignmentType" WHERE id = sjp_daily_pages_type_id);
END $$;
`;

const rollback = `-- Rollback Daily Pages engagement rubric v2
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
`;

writeFileSync(join(migrationDir, 'migration.sql'), sql);
writeFileSync(join(migrationDir, 'rollback.sql'), rollback);
console.log('Wrote', migrationDir);
