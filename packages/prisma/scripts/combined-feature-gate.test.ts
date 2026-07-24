import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { stripPsqlMetaCommands } from './combined-feature-gate';

describe('stripPsqlMetaCommands', () => {
  for (const scriptName of [
    'combined-feature-preflight.sql',
    'combined-feature-postcheck.sql',
  ]) {
    test(`removes the psql-only meta-command from ${scriptName}`, () => {
      const source = readFileSync(join(import.meta.dir, scriptName), 'utf8');
      const executableSql = stripPsqlMetaCommands(source);

      expect(source.startsWith('\\set ON_ERROR_STOP on')).toBe(true);
      expect(executableSql.startsWith('\\')).toBe(false);
      expect(executableSql).toContain('DO $$');
    });
  }

  test('postcheck verifies the paste activity rollout and review schema', () => {
    const source = readFileSync(
      join(import.meta.dir, 'combined-feature-postcheck.sql'),
      'utf8'
    );

    expect(source).toContain('pasteActivityEnabled');
    expect(source).toContain('PasteAlert_reviewedByMembershipId_fkey');
    expect(source).toContain('PasteAlert_reviewedByMembershipId_idx');
    expect(source).toContain('20260723230000_add_paste_activity_rollout_gate');
    expect(source).toContain("data_type = 'timestamp with time zone'");
    expect(source).toContain("constraint_row.confdeltype = 'n'");
    expect(source).toContain("constraint_row.confupdtype = 'c'");
    expect(source).toContain(
      'index_row.indrelid = \'public."PasteAlert"\'::regclass'
    );
    expect(source).toContain('index_row.indnatts = 1');
  });
});
