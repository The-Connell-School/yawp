import { afterEach, describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  cacheVolumeNames,
  computeDependencyFingerprint,
  listDependencyInputs,
} from './dependency-cache.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeSource({ lock = 'lock-v1', webVersion = '1.0.0' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'yawp-dependency-cache-'));
  roots.push(root);
  mkdirSync(path.join(root, 'services/web-app'), { recursive: true });
  mkdirSync(path.join(root, 'packages/prisma'), { recursive: true });
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ private: true, workspaces: ['packages/*', 'services/*'] }),
  );
  writeFileSync(path.join(root, 'bun.lockb'), lock);
  writeFileSync(
    path.join(root, 'services/web-app/package.json'),
    JSON.stringify({ name: 'web-app', version: webVersion }),
  );
  writeFileSync(
    path.join(root, 'packages/prisma/package.json'),
    JSON.stringify({ name: 'prisma', version: '1.0.0' }),
  );
  return root;
}

describe('preview dependency cache identity', () => {
  test('shares a cache for identical dependency inputs in different PR sources', () => {
    const first = makeSource();
    const second = makeSource();

    expect(computeDependencyFingerprint(first)).toBe(
      computeDependencyFingerprint(second),
    );
  });

  test('separates caches when either the lockfile or a workspace manifest changes', () => {
    const baseline = makeSource();
    const changedLock = makeSource({ lock: 'lock-v2' });
    const changedManifest = makeSource({ webVersion: '2.0.0' });
    const fingerprint = computeDependencyFingerprint(baseline);

    expect(computeDependencyFingerprint(changedLock)).not.toBe(fingerprint);
    expect(computeDependencyFingerprint(changedManifest)).not.toBe(
      fingerprint,
    );
  });

  test('includes only lockfiles and package manifests in deterministic path order', () => {
    const source = makeSource();
    writeFileSync(path.join(source, '.env'), 'PR_ONLY=value\n');
    writeFileSync(path.join(source, 'services/web-app/app.ts'), 'changed source');

    expect(listDependencyInputs(source)).toEqual([
      'bun.lockb',
      'package.json',
      'packages/prisma/package.json',
      'services/web-app/package.json',
    ]);
  });

  test('uses validated namespaced Docker volume names', () => {
    const fingerprint = 'a'.repeat(64);

    expect(cacheVolumeNames(fingerprint)).toEqual({
      root: `yawp-preview-deps-v2-${fingerprint}-root`,
      web: `yawp-preview-deps-v2-${fingerprint}-web`,
    });
    expect(() => cacheVolumeNames('../shared')).toThrow(
      'dependency fingerprint must be 64 lowercase hexadecimal characters',
    );
  });
});
