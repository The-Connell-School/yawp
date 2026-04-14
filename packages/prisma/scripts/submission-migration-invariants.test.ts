import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  import.meta.dirname,
  '../migrations/20260410192601_consolidate_submissions/migration.sql',
);

describe('consolidate_submissions migration', () => {
  test('backfills grade comments for decoupled grades (snapshotId NULL)', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('decoupled grades');
    expect(sql).toContain('JOIN LATERAL');
    expect(sql).toContain('submittedSnapshotId');
  });
});
