import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.join(import.meta.dir, 'gc-dependency-caches.sh');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function volumeName(fingerprint, kind) {
  return `yawp-preview-deps-v2-${fingerprint}-${kind}`;
}

function makeHarness() {
  const root = mkdtempSync(path.join(tmpdir(), 'yawp-cache-gc-'));
  roots.push(root);
  const bin = path.join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(root, 'removed'), '');
  const docker = path.join(bin, 'docker');
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1 $2" == "volume ls" ]]; then
  printf '%s\\n' "$FAKE_VOLUMES"
  exit 0
fi
if [[ "$1 $2" == "volume inspect" ]]; then
  format="$4"
  volume="$5"
  fingerprint="\${volume%-root}"; fingerprint="\${fingerprint%-web}"; fingerprint="\${fingerprint##*-v2-}"
  case "$format" in
    *dependency-fingerprint*) printf '%s\\n' "$fingerprint" ;;
    *created-at*) printf '%s\\n' "\${FAKE_CREATED_AT:-100}" ;;
    *) exit 2 ;;
  esac
  exit 0
fi
if [[ "$1 $2" == "volume rm" ]]; then
  volume="$3"
  if [[ " \${FAKE_IN_USE:-} " == *" $volume "* ]]; then exit 1; fi
  printf '%s\\n' "$volume" >> "$FAKE_REMOVED"
  exit 0
fi
exit 2
`,
  );
  chmodSync(docker, 0o755);
  return { root, bin };
}

function runGc(root, bin, volumes, env = {}) {
  return spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      PREVIEW_ROOT: root,
      PREVIEW_DEPENDENCY_CACHE_GRACE_HOURS: '24',
      PREVIEW_GC_NOW_EPOCH: '100000',
      FAKE_CREATED_AT: '100',
      FAKE_VOLUMES: volumes.join('\n'),
      FAKE_REMOVED: path.join(root, 'removed'),
      ...env,
    },
  });
}

describe('dependency cache garbage collection', () => {
  test('removes only old, unreferenced, correctly labeled cache pairs', () => {
    const { root, bin } = makeHarness();
    const referenced = 'a'.repeat(64);
    const stale = 'b'.repeat(64);
    const preview = path.join(root, 'previews/pr-241');
    mkdirSync(preview, { recursive: true });
    writeFileSync(path.join(preview, 'dependency-cache.sha256'), `${referenced}\n`);

    const result = runGc(root, bin, [
      volumeName(referenced, 'root'),
      volumeName(referenced, 'web'),
      volumeName(stale, 'root'),
      volumeName(stale, 'web'),
      'some-unrelated-volume',
    ]);

    expect(result.status).toBe(0);
    expect(readFileSync(path.join(root, 'removed'), 'utf8').trim().split('\n')).toEqual([
      volumeName(stale, 'root'),
      volumeName(stale, 'web'),
    ]);
  });

  test('keeps recent caches for rollback and deploy retries', () => {
    const { root, bin } = makeHarness();
    const fingerprint = 'c'.repeat(64);

    const result = runGc(
      root,
      bin,
      [volumeName(fingerprint, 'root'), volumeName(fingerprint, 'web')],
      { FAKE_CREATED_AT: '99900' },
    );

    expect(result.status).toBe(0);
    expect(readFileSync(path.join(root, 'removed'), 'utf8')).toBe('');
  });

  test('does not fail reconciliation when Docker reports a cache still mounted', () => {
    const { root, bin } = makeHarness();
    const fingerprint = 'd'.repeat(64);
    const rootVolume = volumeName(fingerprint, 'root');

    const result = runGc(root, bin, [rootVolume], {
      FAKE_IN_USE: rootVolume,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('still mounted');
    expect(readFileSync(path.join(root, 'removed'), 'utf8')).toBe('');
  });
});
