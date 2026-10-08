import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectTestFiles, parseArgs, parseSummary } from './test-isolated';

describe('test-isolated', () => {
  test('defaults to app/ and passes non-path flags through to bun test', () => {
    expect(parseArgs(['--timeout', '--jobs', '3'])).toEqual({
      paths: ['app/'],
      passthrough: ['--timeout'],
      jobs: 3,
    });
    expect(parseArgs(['app/utils', '--jobs=2', '--bail']).paths).toEqual(['app/utils']);
    expect(() => parseArgs(['--jobs', '0'])).toThrow();
  });

  test('collects .test.ts and .test.tsx files, including route folders with $', () => {
    const root = mkdtempSync(join(tmpdir(), 'test-isolated-'));
    mkdirSync(join(root, 'app/routes/app.x.$id'), { recursive: true });
    mkdirSync(join(root, 'app/node_modules/pkg'), { recursive: true });
    writeFileSync(join(root, 'app/routes/app.x.$id/route.test.ts'), '');
    writeFileSync(join(root, 'app/routes/app.x.$id/view.test.tsx'), '');
    writeFileSync(join(root, 'app/routes/app.x.$id/route.ts'), '');
    writeFileSync(join(root, 'app/node_modules/pkg/a.test.ts'), '');
    expect(collectTestFiles(['app/'], root)).toEqual([
      'app/routes/app.x.$id/route.test.ts',
      'app/routes/app.x.$id/view.test.tsx',
    ]);
  });

  test('reads the pass, fail, and skip counts from bun test output', () => {
    expect(parseSummary('\n 12 pass\n 1 skip\n 2 fail\n 30 expect() calls\n')).toEqual({
      pass: 12,
      fail: 2,
      skip: 1,
    });
    expect(parseSummary('error: something broke before tests ran')).toEqual({ pass: 0, fail: 0, skip: 0 });
  });
});
