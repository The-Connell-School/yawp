import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.join(import.meta.dir, 'check-vite-deps.mjs');
const roots = [];

function run(args) {
  return Bun.spawnSync({
    cmd: ['node', script, ...args],
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('check-vite-deps.mjs', () => {
  test('accepts a self-consistent cache directory', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'yawp-vite-deps-'));
    roots.push(root);
    writeFileSync(
      path.join(root, '_metadata.json'),
      JSON.stringify({
        lockfileHash: 'abcd1234',
        optimized: { react: { file: 'react.js' } },
        chunks: {},
      }),
    );
    writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    writeFileSync(path.join(root, 'react.js'), 'export default {};\n');

    const result = run([root, 'abcd1234']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('ok');
  });

  test('rejects a cache with missing chunks', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'yawp-vite-deps-'));
    roots.push(root);
    writeFileSync(
      path.join(root, '_metadata.json'),
      JSON.stringify({
        lockfileHash: 'abcd1234',
        optimized: { react: { file: 'missing.js' } },
        chunks: {},
      }),
    );
    writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');

    const result = run([root, 'abcd1234']);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('missing');
  });
});
