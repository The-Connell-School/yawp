import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  import.meta.dirname,
  '../migrations/20260808140000_enable_combined_features_for_all_orgs/migration.sql',
);

const schemaPath = join(import.meta.dirname, '../schema.prisma');

const FLAGS = [
  'reporterEnabled',
  'classInsightsEnabled',
  'writingPracticeEnabled',
] as const;

describe('enable_combined_features_for_all_orgs migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  test.each(FLAGS)('flips %s on for every existing organization', (flag) => {
    expect(sql).toContain(`"${flag}" = true`);
  });

  test.each(FLAGS)('makes %s default to true for new organizations', (flag) => {
    expect(sql).toContain(
      `ALTER TABLE "Organization" ALTER COLUMN "${flag}" SET DEFAULT true;`,
    );
  });

  test('updates the Organization table in place rather than recreating it', () => {
    expect(sql).toContain('UPDATE "Organization"');
    expect(sql).not.toContain('DROP TABLE');
  });
});

describe('Organization feature flag schema defaults', () => {
  const schema = readFileSync(schemaPath, 'utf8');

  test.each(FLAGS)('%s is declared @default(true)', (flag) => {
    const line = schema
      .split('\n')
      .find((candidate) => candidate.trim().startsWith(`${flag} `));
    expect(line).toBeDefined();
    expect(line).toContain('@default(true)');
  });
});
