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
});
