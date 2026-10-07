import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_DIR = join(
  import.meta.dir,
  '..',
  'migrations',
  '20261007210000_daily_pages_engagement_rubric_consolidation'
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
  });

  test('captures library v1 and publishes v2 with a stable request id', () => {
    const sql = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');

    expect(sql).toContain('dp-engagement-library-v1-capture');
    expect(sql).toContain('brian-dp-rubric-2026-10-02');
    expect(sql).toContain('Brian 2026-10-02 merged Daily Pages rubric');
  });

  test('rollback restores rubricId pointers on both assignment types', () => {
    const rollback = readFileSync(join(MIGRATION_DIR, 'rollback.sql'), 'utf8');

    expect(rollback).toContain('dailyPagesTypePreviousRubricId');
    expect(rollback).toContain('sjpTypePreviousRubricId');
    expect(rollback).toContain('SET "rubricId" = dp_prev_rubric');
  });
});
