import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.join(import.meta.dir, 'enforce-cap.sh');
const roots = [];

// The bug this file exists to catch: the in-container build writes into the bind-mounted
// source tree as root, so the host deploy user cannot unlink those files. A plain
// `rm -rf` under `set -euo pipefail` then aborted cap enforcement before any deploy ran.
//
// Reproducing it needs a file the host user genuinely cannot remove, and that depends on
// the platform: Linux bind mounts pass real UIDs through, so container root writes land
// root-owned. Docker Desktop on macOS remaps them to the host user, which deletes fine —
// there the condition cannot be built at all. Probe for it rather than assuming, so this
// test never reports a pass it did not earn.
function canReproduceRootOwnership() {
  if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) return false;
  const probe = mkdtempSync(path.join(tmpdir(), 'enforce-cap-probe-'));
  try {
    const written = spawnSync('docker', [
      'run', '--rm', '--user', '0:0', '--entrypoint', '/bin/sh',
      '-v', `${probe}:/t`, 'oven/bun:1.3.1', '-c', 'echo x > /t/f.txt',
    ], { stdio: 'ignore' });
    if (written.status !== 0) return false;
    // The condition exists only if the host user cannot delete what root wrote.
    return spawnSync('rm', ['-f', path.join(probe, 'f.txt')], { stdio: 'ignore' }).status !== 0;
  } finally {
    spawnSync('docker', [
      'run', '--rm', '--user', '0:0', '--entrypoint', '/bin/sh',
      '-v', `${probe}:/t`, 'oven/bun:1.3.1', '-c', 'rm -rf /t/*',
    ], { stdio: 'ignore' });
    rmSync(probe, { recursive: true, force: true });
  }
}

const canReproduce = canReproduceRootOwnership();
if (!canReproduce) {
  console.warn(
    '[enforce-cap.test] SKIPPING the root-owned-build-output regression: this platform '
    + 'remaps container-root writes to the host user, so the failure cannot be reproduced. '
    + 'It is covered on Linux CI and by the real preview-deploy job.',
  );
}

function makeRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'enforce-cap-'));
  roots.push(root);
  return root;
}

function makeEnv(root, pr, { rootOwnedFile = false } = {}) {
  const previewDir = path.join(root, 'previews', `pr-${pr}`);
  const sourceDir = path.join(root, 'sources', `pr-${pr}`);
  mkdirSync(previewDir, { recursive: true });
  mkdirSync(path.join(sourceDir, 'services/web-app'), { recursive: true });
  writeFileSync(path.join(sourceDir, 'services/web-app/ok.txt'), 'removable\n');

  if (rootOwnedFile) {
    // Mirror how the real files are produced: a container writing into a bind mount, at
    // the exact path that broke the deploy. No chmod — the point is OWNERSHIP, and faking
    // it with directory modes would test a mechanism the production bug does not use.
    const generated = path.join(sourceDir, 'services/web-app/.react-router/types');
    const result = spawnSync('docker', [
      'run', '--rm', '--user', '0:0', '--entrypoint', '/bin/sh',
      '-v', `${sourceDir}:/app`, 'oven/bun:1.3.1',
      '-c', 'mkdir -p /app/services/web-app/.react-router/types && '
        + 'echo x > /app/services/web-app/.react-router/types/+routes.ts',
    ], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`fixture setup failed: ${result.stderr}`);
    if (!existsSync(generated)) throw new Error('fixture did not create the generated tree');
  }
  return { previewDir, sourceDir };
}

function run(root, env = {}) {
  return spawnSync('bash', [script], {
    encoding: 'utf8',
    env: { ...process.env, PREVIEW_ROOT: root, ...env },
  });
}

function parse(stdout) {
  return Object.fromEntries(
    stdout.split('\n')
      .filter((line) => /^CAP_[A-Z]+=/.test(line))
      .map((line) => line.split('=')),
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Only a fixture that really is root-owned needs the container, and spawning one
      // per test root is slow enough to time the hook out — so pay for it only on failure.
      spawnSync('docker', [
        'run', '--rm', '--user', '0:0', '--entrypoint', '/bin/sh',
        '-v', `${root}:/target`, 'oven/bun:1.3.1', '-c', 'rm -rf /target/*',
      ], { stdio: 'ignore' });
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('enforce-cap.sh', () => {
  test('reclaims an environment whose PR is closed', () => {
    const root = makeRoot();
    const { previewDir, sourceDir } = makeEnv(root, 232);
    makeEnv(root, 233);

    const result = run(root, { OPEN_PR_NUMBERS: '233', KEEP_PR: '233', PREVIEW_MAX_ENVS: '30' });

    expect(result.status).toBe(0);
    expect(parse(result.stdout)).toMatchObject({
      CAP_RECLAIMED: '1',
      CAP_LIVE: '1',
      CAP_RESULT: 'ok',
    });
    expect(existsSync(previewDir)).toBe(false);
    expect(existsSync(sourceDir)).toBe(false);
  });

  test('leaves open pull requests alone', () => {
    const root = makeRoot();
    const { previewDir } = makeEnv(root, 233);

    const result = run(root, { OPEN_PR_NUMBERS: '233', KEEP_PR: '233', PREVIEW_MAX_ENVS: '30' });

    expect(result.status).toBe(0);
    expect(parse(result.stdout).CAP_RECLAIMED).toBe('0');
    expect(existsSync(previewDir)).toBe(true);
  });

  test('evicts the least active environment when the cap is reached', () => {
    const root = makeRoot();
    makeEnv(root, 100);
    makeEnv(root, 101);
    const incoming = makeEnv(root, 102);
    rmSync(incoming.previewDir, { recursive: true });

    const result = run(root, {
      OPEN_PR_NUMBERS: '100 101 102',
      KEEP_PR: '102',
      PREVIEW_MAX_ENVS: '2',
      // 101 is a draft, so it goes before 100 despite being touched more recently.
      PR_ACTIVITY: '100 1000 0\n101 2000 1',
    });

    expect(result.status).toBe(0);
    expect(parse(result.stdout)).toMatchObject({ CAP_EVICTED: '101', CAP_RESULT: 'ok' });
    expect(existsSync(path.join(root, 'previews/pr-101'))).toBe(false);
    expect(existsSync(path.join(root, 'previews/pr-100'))).toBe(true);
  });

  test('never evicts the incoming pull request', () => {
    const root = makeRoot();
    makeEnv(root, 100);
    makeEnv(root, 102);

    const result = run(root, {
      OPEN_PR_NUMBERS: '100 102',
      KEEP_PR: '102',
      PREVIEW_MAX_ENVS: '1',
      PR_ACTIVITY: '100 5000 0\n102 1 1',
    });

    // 102 is the oldest AND a draft, so ranking alone would take it first.
    expect(parse(result.stdout).CAP_EVICTED).toBe('100');
    expect(existsSync(path.join(root, 'previews/pr-102'))).toBe(true);
  });

  test.if(canReproduce)(
    'reclaims an environment whose source tree contains root-owned build output',
    () => {
      const root = makeRoot();
      const { previewDir, sourceDir } = makeEnv(root, 232, { rootOwnedFile: true });
      makeEnv(root, 233);

      // Establish the fixture is actually unremovable by the unprivileged path, so this
      // test cannot silently stop covering the regression.
      const plain = spawnSync('rm', ['-rf', sourceDir], { encoding: 'utf8' });
      expect(plain.status).not.toBe(0);
      expect(existsSync(sourceDir)).toBe(true);

      const result = run(root, { OPEN_PR_NUMBERS: '233', KEEP_PR: '233', PREVIEW_MAX_ENVS: '30' });

      expect(result.status).toBe(0);
      expect(parse(result.stdout)).toMatchObject({ CAP_RECLAIMED: '1', CAP_RESULT: 'ok' });
      expect(existsSync(previewDir)).toBe(false);
      expect(existsSync(sourceDir)).toBe(false);
    },
  );

  test('refuses to destroy a malformed environment id', () => {
    const root = makeRoot();
    mkdirSync(path.join(root, 'previews/pr-0'), { recursive: true });
    makeEnv(root, 233);

    const result = run(root, { OPEN_PR_NUMBERS: '233', KEEP_PR: '233', PREVIEW_MAX_ENVS: '30' });

    // pr-0 fails the id pattern in live_env_numbers, so it is never a destroy target.
    expect(result.status).toBe(0);
    expect(existsSync(path.join(root, 'previews/pr-0'))).toBe(true);
  });
});
