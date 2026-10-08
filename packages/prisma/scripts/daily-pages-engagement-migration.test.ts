import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildDailyPagesEngagementV2SchemaJson } from './apply-daily-pages-engagement-v2-seed';

const MIGRATION_DIR = join(
  import.meta.dir,
  '..',
  'migrations',
  '20261008121500_daily_pages_engagement_rubric_consolidation'
);

describe('daily-pages-engagement migration SQL', () => {
  test('only sets rubricId on prod assignment types (does not rewrite per-type rubric JSON)', () => {
    const sql = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');

    expect(sql).toContain('cmlgtyo8j01em0qjs6knw7cni');
    expect(sql).toContain('cmtk7cy2r017y01l8r5ix4kxf');
    expect(sql).toContain('SET "rubricId" = engagement_id');
    expect(sql).not.toContain('"rubricJson" = v2_schema');
    expect(sql).not.toContain('"scoringScaleJson" = v2_schema');
    expect(sql).not.toContain('"gradingPromptConfigJson" = v2_schema');
    expect(sql).not.toContain('JOIN "AssignmentModule"');
    expect(sql).toContain('a."assignmentTypeId" IN (daily_pages_type_id, sjp_daily_pages_type_id)');
    expect(sql).toContain('"rubricId" IS NULL');
  });

  test('captures library v1 and publishes v2 with a stable request id', () => {
    const sql = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');

    expect(sql).toContain('dp-engagement-library-v1-capture');
    expect(sql).toContain('brian-dp-rubric-2026-10-02');
    expect(sql).toContain('Brian 2026-10-02 merged Daily Pages rubric');
  });

  test('preserves teacherNotesEnabled from the current library row when publishing v2', () => {
    const sql = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');

    expect(sql).toContain("rub_row.\"schemaJson\"->'outputSchema' ? 'teacherNotesEnabled'");
    expect(sql).toContain(
      "rub_row.\"schemaJson\"->'outputSchema'->'teacherNotesEnabled'"
    );
    expect(sql).not.toMatch(/"teacherNotesEnabled":\s*true/);
  });

  test('backfills restore-table columns when an older preview table exists', () => {
    const sql = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');

    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "dailyPagesTypePreviousRubricId"'
    );
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "sjpTypePreviousRubricId"'
    );
    expect(sql).toContain('SET LOCAL lock_timeout');
  });

  test('rollback restores rubricId pointers on both assignment types', () => {
    const rollback = readFileSync(join(MIGRATION_DIR, 'rollback.sql'), 'utf8');

    expect(rollback).toContain('dailyPagesTypePreviousRubricId');
    expect(rollback).toContain('sjpTypePreviousRubricId');
    expect(rollback).toContain('SET "rubricId" = dp_prev_rubric');
  });
});

describe('daily-pages-engagement v2 teacherNotesEnabled preservation', () => {
  test('carries true from the current rubric into consolidated outputSchema', () => {
    const v2 = buildDailyPagesEngagementV2SchemaJson({
      outputSchema: { schemaVersion: 1, teacherNotesEnabled: true },
    }) as { outputSchema: Record<string, unknown> };

    expect(v2.outputSchema.teacherNotesEnabled).toBe(true);
    expect(v2.outputSchema.assignmentPointScaling).toBe(
      'daily_pages_engagement_v2'
    );
  });

  test('does not add teacherNotesEnabled when absent on the current rubric', () => {
    const v2 = buildDailyPagesEngagementV2SchemaJson({
      outputSchema: { schemaVersion: 1 },
    }) as { outputSchema: Record<string, unknown> };

    expect(v2.outputSchema).not.toHaveProperty('teacherNotesEnabled');
  });
});
