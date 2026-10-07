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

-- Audit: prior library current revision before v2 publish
CREATE TABLE IF NOT EXISTS "InternalDpEngagementRubricRestore" (
  "rubricId" TEXT PRIMARY KEY REFERENCES "Rubric"("id") ON DELETE CASCADE,
  "previousSchemaJson" JSONB NOT NULL,
  "previousCurrentRevisionId" TEXT,
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
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Rubric" WHERE id = engagement_id) THEN
    RAISE NOTICE 'Skipping DP engagement v2: library rubric % not found', engagement_id;
    RETURN;
  END IF;

  SELECT id, "schemaJson", "currentRevisionId" INTO rub_row
  FROM "Rubric" WHERE id = engagement_id;

  INSERT INTO "InternalDpEngagementRubricRestore" (
    "rubricId", "previousSchemaJson", "previousCurrentRevisionId",
    "archivedShortFormRubricId", "archivedReflectionRubricId"
  ) VALUES (
    engagement_id, rub_row."schemaJson", rub_row."currentRevisionId",
    short_form_id, reflection_id
  )
  ON CONFLICT ("rubricId") DO NOTHING;

  -- Pin assignments on affected types before rubric JSON changes (idempotent)
  INSERT INTO "InternalAssignmentRubricPinBackfill" ("assignmentId", "selectedRevisionId", "reason")
  SELECT a.id, a."rubricRevisionId", 'dp_engagement_v2_pre_publish'
  FROM "Assignment" a
  JOIN "AssignmentModule" am ON am.id = a."assignmentModuleId"
  WHERE a."rubricRevisionId" IS NOT NULL
    AND am."assignmentTypeId" IN (daily_pages_type_id, sjp_daily_pages_type_id)
  ON CONFLICT ("assignmentId") DO NOTHING;

  UPDATE "Rubric"
  SET "schemaJson" = v2_schema, "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = engagement_id
    AND ("schemaJson"->'outputSchema'->>'assignmentPointScaling' IS DISTINCT FROM 'daily_pages_engagement_v2');

  UPDATE "Rubric"
  SET "archivedAt" = COALESCE("archivedAt", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP
  WHERE id IN (short_form_id, reflection_id)
     OR name IN ('daily-pages-short-form', 'daily-pages-reflection');

  -- Point library-linked Daily Pages types at engagement rubric; clear legacy per-type JSON when it matches old engagement scale
  UPDATE "AssignmentType"
  SET
    "rubricId" = engagement_id,
    "gradingOutputSchemaJson" = COALESCE("gradingOutputSchemaJson", '{}'::jsonb) || jsonb_build_object('assignmentPointScaling', 'daily_pages_engagement_v2'),
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE id IN (daily_pages_type_id, sjp_daily_pages_type_id);

  UPDATE "AssignmentType"
  SET
    "rubricJson" = v2_schema->'rubric',
    "scoringScaleJson" = v2_schema->'scoringScale',
    "gradingPromptConfigJson" = v2_schema->'promptConfig',
    "gradingOutputSchemaJson" = v2_schema->'outputSchema',
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE id = daily_pages_type_id
    AND "rubricJson" @> '{"categories":[{"key":"engagement_with_prompt"}]}'::jsonb;
END $$;
`;

const rollback = `-- Rollback Daily Pages engagement rubric v2
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
`;

writeFileSync(join(migrationDir, 'migration.sql'), sql);
writeFileSync(join(migrationDir, 'rollback.sql'), rollback);
console.log('Wrote', migrationDir);
