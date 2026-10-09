import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { viteLockfileHash } from './vite-lockfile-hash.mjs';

const roots = [];

function makeRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'yawp-vite-lock-'));
  roots.push(root);
  mkdirSync(path.join(root, 'services', 'web-app'), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('vite-lockfile-hash.mjs', () => {
  test('hashes bun.lockb deterministically using Vite rules', () => {
    const root = makeRoot();
    writeFileSync(path.join(root, 'bun.lockb'), 'binary-lock-content', 'utf-8');
    const hash = viteLockfileHash(root);
    expect(hash).toBe('39206e26');
    expect(viteLockfileHash(root)).toBe(hash);
  });

  test('includes patches directory mtime in the hash', () => {
    const root = makeRoot();
    writeFileSync(path.join(root, 'bun.lockb'), 'binary-lock-content', 'utf-8');
    const withoutPatches = viteLockfileHash(root);
    mkdirSync(path.join(root, 'patches'));
    expect(viteLockfileHash(root)).not.toBe(withoutPatches);
  });
});
