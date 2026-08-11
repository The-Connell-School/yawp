import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
    // Unlink permission comes from the CONTAINING DIRECTORY, not the file — so a
    // root-owned file inside a host-owned directory deletes fine, and probing with one
    // reports "cannot reproduce" on a runner where the bug reproduces perfectly well.
    // The real condition is a root-owned DIRECTORY (the build does `mkdir -p
    // .react-router/types` as root), whose entries the host user then cannot remove.
    const written = spawnSync('docker', [
      'run', '--rm', '--user', '0:0', '--entrypoint', '/bin/sh',
      '-v', `${probe}:/t`, 'oven/bun:1.3.1', '-c', 'mkdir -p /t/d && echo x > /t/d/f.txt',
    ], { stdio: 'ignore' });
    if (written.status !== 0) return false;
    return spawnSync('rm', ['-rf', path.join(probe, 'd')], { stdio: 'ignore' }).status !== 0
      || existsSync(path.join(probe, 'd'));
  } finally {
    spawnSync('docker', [
      'run', '--rm', '--user', '0:0', '--entrypoint', '/bin/sh',
      '-v', `${probe}:/t`, 'oven/bun:1.3.1', '-c', 'rm -rf /t/*',
    ], { stdio: 'ignore' });
    rmSync(probe, { recursive: true, force: true });
  }
}

const canReproduce = canReproduceRootOwnership();

// A skip is the correct outcome on a macOS workstation and an unacceptable one on Linux
// CI, which is the only place this regression is covered at all. Without this gate the
// coverage could evaporate — rootless Docker, a userns remap, a missing image — and
// report a green suite that proves nothing, which is how the bug shipped the first time.
const requireReproduction = process.env.ENFORCE_CAP_REQUIRE_ROOT_OWNERSHIP === '1';
if (requireReproduction && !canReproduce) {
  throw new Error(
    'ENFORCE_CAP_REQUIRE_ROOT_OWNERSHIP=1 but container-root writes are not root-owned on '
    + 'the host, so the reclaim regression cannot be exercised. Refusing to skip it here: '
    + 'fix the runner (Docker present, not rootless, no userns remap) or unset the flag.',
  );
}
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

function makeEnv(root, pr, { rootOwnedFile = false, withCompose = false } = {}) {
  const previewDir = path.join(root, 'previews', `pr-${pr}`);
  const sourceDir = path.join(root, 'sources', `pr-${pr}`);
  mkdirSync(previewDir, { recursive: true });
  mkdirSync(path.join(sourceDir, 'services/web-app'), { recursive: true });
  writeFileSync(path.join(sourceDir, 'services/web-app/ok.txt'), 'removable\n');
  if (withCompose) {
    writeFileSync(path.join(previewDir, 'docker-compose.yml'), 'services: {}\n');
    writeFileSync(path.join(previewDir, '.preview-access-code'), 'preserved-code\n');
    writeFileSync(path.join(previewDir, '.database-marker'), 'preserved-db\n');
  }

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

function makeDockerStub(root, runningPrs = []) {
  const state = path.join(root, 'running-prs.txt');
  const log = path.join(root, 'docker.log');
  const stub = path.join(root, 'docker-stub.sh');
  writeFileSync(state, `${runningPrs.join('\n')}${runningPrs.length ? '\n' : ''}`);
  writeFileSync(
    stub,
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$PREVIEW_DOCKER_LOG"
if [[ "$1" == "ps" ]]; then
  if [[ "$*" =~ com.docker.compose.project=yawp-pr-([0-9]+) ]]; then
    pr="\${BASH_REMATCH[1]}"
    grep -qx "$pr" "$PREVIEW_DOCKER_STATE" 2>/dev/null && echo "container-$pr"
  fi
  exit 0
fi
if [[ "$1" == "compose" && "$*" == *" stop web"* ]]; then
  if [[ "$*" =~ -p[[:space:]]+yawp-pr-([0-9]+) ]]; then
    pr="\${BASH_REMATCH[1]}"
    if [[ "\${PREVIEW_DOCKER_FAIL_STOP_PR:-}" == "$pr" ]]; then
      exit 1
    fi
    awk -v pr="$pr" '$0 != pr' "$PREVIEW_DOCKER_STATE" > "$PREVIEW_DOCKER_STATE.next"
    mv "$PREVIEW_DOCKER_STATE.next" "$PREVIEW_DOCKER_STATE"
  fi
  exit 0
fi
if [[ "$1" == "inspect" ]]; then exit 1; fi
exit 0
`
  );
  chmodSync(stub, 0o755);
  return { stub, state, log };
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

  test('counts stopped residents without counting them as running', () => {
    const root = makeRoot();
    makeEnv(root, 100, { withCompose: true });
    const docker = makeDockerStub(root);

    const result = run(root, {
      OPEN_PR_NUMBERS: '100',
      PR_ACTIVITY: '100 9999 0 0',
      PREVIEW_MODE: 'reconcile',
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_STATE: docker.state,
      PREVIEW_DOCKER_LOG: docker.log,
      PREVIEW_SLEEP_ENABLED: 'true',
      PREVIEW_NOW_EPOCH: '10000',
      PREVIEW_MAX_RESIDENT: '20',
      PREVIEW_MAX_RUNNING: '8',
    });

    expect(result.status).toBe(0);
    expect(parse(result.stdout)).toMatchObject({
      CAP_RESIDENT: '1',
      CAP_RUNNING: '0',
      CAP_RESULT: 'ok',
    });
  });

  test('sleeps an idle draft without deleting its state', () => {
    const root = makeRoot();
    const env = makeEnv(root, 101, { withCompose: true });
    const docker = makeDockerStub(root, [101]);
    const now = 200_000;

    const result = run(root, {
      OPEN_PR_NUMBERS: '101',
      PR_ACTIVITY: `101 ${now - 25 * 3600} 1 0`,
      PREVIEW_MODE: 'reconcile',
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_STATE: docker.state,
      PREVIEW_DOCKER_LOG: docker.log,
      PREVIEW_SLEEP_ENABLED: 'true',
      PREVIEW_DRAFT_IDLE_HOURS: '24',
      PREVIEW_READY_IDLE_HOURS: '72',
      PREVIEW_NOW_EPOCH: String(now),
      PREVIEW_MAX_RESIDENT: '20',
      PREVIEW_MAX_RUNNING: '8',
    });

    expect(result.status).toBe(0);
    expect(parse(result.stdout)).toMatchObject({
      CAP_SLEPT: '101',
      CAP_RESIDENT: '1',
      CAP_RUNNING: '0',
    });
    expect(existsSync(env.previewDir)).toBe(true);
    expect(existsSync(env.sourceDir)).toBe(true);
    expect(existsSync(path.join(env.previewDir, '.preview-access-code'))).toBe(true);
    expect(existsSync(path.join(env.previewDir, '.database-marker'))).toBe(true);
    expect(readFileSync(docker.log, 'utf8')).toContain('stop web');
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' down ');
  });

  test('keeps a recently active ready PR running', () => {
    const root = makeRoot();
    makeEnv(root, 102, { withCompose: true });
    const docker = makeDockerStub(root, [102]);
    const now = 400_000;

    const result = run(root, {
      OPEN_PR_NUMBERS: '102',
      PR_ACTIVITY: `102 ${now - 48 * 3600} 0 0`,
      PREVIEW_MODE: 'reconcile',
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_STATE: docker.state,
      PREVIEW_DOCKER_LOG: docker.log,
      PREVIEW_SLEEP_ENABLED: 'true',
      PREVIEW_NOW_EPOCH: String(now),
      PREVIEW_MAX_RESIDENT: '20',
      PREVIEW_MAX_RUNNING: '8',
    });

    expect(parse(result.stdout)).toMatchObject({
      CAP_SLEPT: '',
      CAP_RUNNING: '1',
      CAP_RESULT: 'ok',
    });
  });

  test('running pressure sleeps drafts before ready PRs', () => {
    const root = makeRoot();
    for (const pr of [100, 101, 102]) makeEnv(root, pr, { withCompose: true });
    const docker = makeDockerStub(root, [100, 101, 102]);

    const result = run(root, {
      OPEN_PR_NUMBERS: '100 101 102',
      PR_ACTIVITY: '100 1000 0 0\n101 3000 1 0\n102 2000 0 0',
      PREVIEW_MODE: 'reconcile',
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_STATE: docker.state,
      PREVIEW_DOCKER_LOG: docker.log,
      PREVIEW_SLEEP_ENABLED: 'false',
      PREVIEW_MAX_RESIDENT: '20',
      PREVIEW_MAX_RUNNING: '2',
    });

    expect(parse(result.stdout)).toMatchObject({
      CAP_SLEPT: '101',
      CAP_RUNNING: '2',
      CAP_RESULT: 'ok',
    });
  });

  test('never sleeps a pinned PR and reports a full running cap honestly', () => {
    const root = makeRoot();
    makeEnv(root, 100, { withCompose: true });
    makeEnv(root, 101, { withCompose: true });
    const docker = makeDockerStub(root, [100]);

    const result = run(root, {
      OPEN_PR_NUMBERS: '100 101',
      PR_ACTIVITY: '100 1 1 1\n101 2 0 0',
      PREVIEW_MODE: 'admit',
      KEEP_PR: '101',
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_STATE: docker.state,
      PREVIEW_DOCKER_LOG: docker.log,
      PREVIEW_SLEEP_ENABLED: 'true',
      PREVIEW_NOW_EPOCH: '999999',
      PREVIEW_MAX_RESIDENT: '20',
      PREVIEW_MAX_RUNNING: '1',
    });

    expect(parse(result.stdout)).toMatchObject({
      CAP_SLEPT: '',
      CAP_RUNNING: '1',
      CAP_RESULT: 'full',
      CAP_REASON: 'running-cap',
    });
    expect(readFileSync(docker.state, 'utf8')).toContain('100');
  });

  test('reconcile mode does not invent an incoming resident slot', () => {
    const root = makeRoot();
    makeEnv(root, 100);
    makeEnv(root, 101);
    const docker = makeDockerStub(root);

    const result = run(root, {
      OPEN_PR_NUMBERS: '100 101',
      PR_ACTIVITY: '100 1 0 0\n101 2 0 0',
      PREVIEW_MODE: 'reconcile',
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_STATE: docker.state,
      PREVIEW_DOCKER_LOG: docker.log,
      PREVIEW_MAX_RESIDENT: '2',
      PREVIEW_MAX_RUNNING: '2',
    });

    expect(parse(result.stdout)).toMatchObject({
      CAP_EVICTED: '',
      CAP_RESIDENT: '2',
      CAP_RESULT: 'ok',
    });
    expect(existsSync(path.join(root, 'previews/pr-100'))).toBe(true);
    expect(existsSync(path.join(root, 'previews/pr-101'))).toBe(true);
  });

  test('failed sleep keeps the running count and produces full', () => {
    const root = makeRoot();
    makeEnv(root, 100, { withCompose: true });
    makeEnv(root, 101, { withCompose: true });
    const docker = makeDockerStub(root, [100, 101]);

    const result = run(root, {
      OPEN_PR_NUMBERS: '100 101',
      PR_ACTIVITY: '100 1 1 0\n101 2 0 1',
      PREVIEW_MODE: 'reconcile',
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_STATE: docker.state,
      PREVIEW_DOCKER_LOG: docker.log,
      PREVIEW_DOCKER_FAIL_STOP_PR: '100',
      PREVIEW_MAX_RESIDENT: '20',
      PREVIEW_MAX_RUNNING: '1',
    });

    expect(parse(result.stdout)).toMatchObject({
      CAP_RUNNING: '2',
      CAP_RESULT: 'full',
      CAP_REASON: 'running-cap',
    });
  });
});
