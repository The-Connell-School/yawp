import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('builtin default rubric library rows migration', () => {
  test('only inserts missing rubrics and never updates existing rows', () => {
    const sql = readFileSync(path.join(import.meta.dir, 'migration.sql'), 'utf8');
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql).not.toMatch(/\bUPDATE\s+"Rubric"/i);
    expect(sql).toContain("'thesis-driven-essay'");
    expect(sql).toContain("'class-starter-engagement'");
    expect(sql).toContain("'daily-pages-short-form'");
  });
});
