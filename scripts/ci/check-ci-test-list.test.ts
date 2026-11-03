import { describe, expect, test } from 'bun:test';
import { join } from 'path';
import { findUnlistedTests } from './check-ci-test-list';

const repoRoot = join(import.meta.dir, '../..');

describe('ci.yml Lesson Planner test list', () => {
  test('every Lesson Planner test file is named in ci.yml', () => {
    expect(findUnlistedTests(repoRoot)).toEqual([]);
  });

  test('a file missing from the workflow text is reported', () => {
    const missing = findUnlistedTests(repoRoot, '');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((f) => f.includes('lesson-planner'))).toBe(true);
  });
});
