import { afterEach, describe, expect, test } from 'bun:test';
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
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';

const script = path.join(import.meta.dir, 'wake-preview.sh');
const roots = [];

function makeRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'preview-wake-'));
  roots.push(root);
  mkdirSync(path.join(root, 'previews'), { recursive: true });
  mkdirSync(path.join(root, 'wake', 'access'), { recursive: true });
  return root;
}

function makePreview(root, pr, { access = 0, pinned = false } = {}) {
  const preview = path.join(root, 'previews', `pr-${pr}`);
  mkdirSync(preview, { recursive: true });
  writeFileSync(path.join(preview, 'docker-compose.yml'), 'services:\n  web: {}\n');
  writeFileSync(path.join(preview, 'state-marker'), `state-${pr}\n`);
  writeFileSync(path.join(preview, 'access-secret'), `${'a'.repeat(64)}\n`);
  if (pinned) writeFileSync(path.join(preview, 'keep-awake'), 'true\n');
  if (access > 0) {
    writeFileSync(path.join(root, 'wake', 'access', `pr-${pr}`), `${access}\n`);
  }
  return preview;
}

function makeDockerStub(root, runningPrs = [], healthy = true) {
  const state = path.join(root, 'running-prs.txt');
  const log = path.join(root, 'docker.log');
  const stub = path.join(root, 'docker-stub.sh');
  writeFileSync(state, `${runningPrs.join('\n')}${runningPrs.length ? '\n' : ''}`);
  writeFileSync(log, '');
  writeFileSync(stub, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$PREVIEW_DOCKER_LOG"
if [[ "$1" == "ps" && "$*" == *"--format"* ]]; then
  cat "$PREVIEW_DOCKER_STATE"
  exit 0
fi
if [[ "$1" == "ps" && "$*" =~ com.docker.compose.project=yawp-pr-([0-9]+) ]]; then
  pr="\${BASH_REMATCH[1]}"
  grep -qx "$pr" "$PREVIEW_DOCKER_STATE" 2>/dev/null && echo "container-$pr"
  exit 0
fi
if [[ "$1" == "exec" && "$*" == *"SELECT EXISTS"* ]]; then
  [[ "\${PREVIEW_DOCKER_AUTH_CURRENT:-true}" == "true" ]] && printf '1\\n' || printf '0\\n'
  exit 0
fi
if [[ "$1" == "exec" && "$*" == *"SELECT COALESCE"* ]]; then
  printf '%s\n' "\${PREVIEW_DOCKER_AUTH_CODE:-calm-panda-8127}"
  exit 0
fi
  if [[ "$1" == "compose" && "$*" =~ -p[[:space:]]+yawp-pr-([0-9]+) ]]; then
  pr="\${BASH_REMATCH[1]}"
  if [[ "$*" == *" stop"* ]]; then
    [[ "\${PREVIEW_DOCKER_FAIL_STOP_PR:-}" == "$pr" ]] && exit 1
    if [[ "\${PREVIEW_DOCKER_BLOCK_STOP_PR:-}" == "$pr" ]]; then
      touch "$PREVIEW_DOCKER_STOP_STARTED"
      attempts=0
      while [[ ! -f "$PREVIEW_DOCKER_STOP_RELEASE" && "$attempts" -lt 500 ]]; do
        sleep 0.01
        attempts=$((attempts + 1))
      done
      [[ -f "$PREVIEW_DOCKER_STOP_RELEASE" ]] || exit 1
    fi
    awk -v pr="$pr" '$0 != pr' "$PREVIEW_DOCKER_STATE" > "$PREVIEW_DOCKER_STATE.next"
    mv "$PREVIEW_DOCKER_STATE.next" "$PREVIEW_DOCKER_STATE"
    exit 0
  fi
  if [[ "$*" == *" start"* ]]; then
    [[ "\${PREVIEW_DOCKER_FAIL_START_PR:-}" == "$pr" ]] && exit 1
    grep -qx "$pr" "$PREVIEW_DOCKER_STATE" 2>/dev/null || echo "$pr" >> "$PREVIEW_DOCKER_STATE"
    exit 0
  fi
  if [[ "$*" == *" ps -q web"* ]]; then
    echo "container-$pr"
    exit 0
  fi
fi
if [[ "$1" == "inspect" ]]; then
  if [[ "$*" == *"NetworkSettings.Networks"* ]]; then
    echo "172.18.0.245"
    exit 0
  fi
  ${healthy === 'legacy' ? 'exit 1' : typeof healthy === 'number' ? `[[ "$*" == *"container-${healthy}"* ]] && echo unhealthy || echo healthy` : healthy ? 'echo healthy' : 'echo unhealthy'}
  exit 0
fi
exit 0
`);
  chmodSync(stub, 0o755);
  return { stub, state, log };
}

function run(root, pr, docker, env = {}) {
  return spawnSync('bash', [script, String(pr)], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PREVIEW_ROOT: root,
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_STATE: docker.state,
      PREVIEW_DOCKER_LOG: docker.log,
      PREVIEW_MAX_RUNNING: '2',
      PREVIEW_WAKE_SKIP_FLOCK: 'true',
      PREVIEW_WAKE_HEALTH_ATTEMPTS: '2',
      PREVIEW_WAKE_HEALTH_INTERVAL_SECONDS: '0',
      ...env,
    },
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('wake-preview.sh', () => {
  test('returns immediately when the requested preview is already running', () => {
    const root = makeRoot();
    makePreview(root, 241);
    const docker = makeDockerStub(root, [241]);

    const result = run(root, 241, docker);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('WAKE_RESULT=already-running');
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' start');
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' stop');
  });

  test('does not authorize an already-running preview until it is healthy', () => {
    const root = makeRoot();
    makePreview(root, 241);
    const docker = makeDockerStub(root, [241], false);

    const result = run(root, 241, docker);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('healthy');
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' start');
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' stop');
  });

  test('starts an existing sleeping Compose project without rebuilding or deleting state', () => {
    const root = makeRoot();
    const preview = makePreview(root, 241);
    const docker = makeDockerStub(root, [100]);

    const result = run(root, 241, docker);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('WAKE_RESULT=woken');
    expect(readFileSync(docker.log, 'utf8')).toContain('compose -p yawp-pr-241');
    expect(readFileSync(docker.log, 'utf8')).toContain(' start');
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' up ');
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' down ');
    expect(readFileSync(path.join(preview, 'state-marker'), 'utf8')).toBe('state-241\n');
  });

  test('does not start a sleeping preview while its source deployment is in flight', () => {
    const root = makeRoot();
    makePreview(root, 241);
    const inflight = path.join(root, 'inflight', 'pr-241');
    mkdirSync(inflight, { recursive: true });
    writeFileSync(path.join(inflight, '1000-1'), '');
    const docker = makeDockerStub(root);

    const result = run(root, 241, docker, {
      PREVIEW_NOW_EPOCH: String(Math.floor(Date.now() / 1000)),
      PREVIEW_INFLIGHT_TTL_SECONDS: '3600',
    });

    expect(result.status).toBe(11);
    expect(result.stderr).toContain('deployment is in progress');
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' start');
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' stop');
  });

  test('ignores a stale deployment marker when waking a sleeping preview', () => {
    const root = makeRoot();
    makePreview(root, 241);
    const inflight = path.join(root, 'inflight', 'pr-241');
    mkdirSync(inflight, { recursive: true });
    const marker = path.join(inflight, '1000-1');
    writeFileSync(marker, '');
    const docker = makeDockerStub(root);

    const result = run(root, 241, docker, {
      PREVIEW_NOW_EPOCH: String(Math.floor(Date.now() / 1000) + 7200),
      PREVIEW_INFLIGHT_TTL_SECONDS: '3600',
    });

    expect(result.status).toBe(0);
    expect(readFileSync(docker.log, 'utf8')).toContain(' start');
  });

  test('never wakes a partially synced preview after its transient marker expires', () => {
    const root = makeRoot();
    makePreview(root, 241);
    const quarantine = path.join(root, 'quarantine');
    mkdirSync(quarantine, { recursive: true });
    writeFileSync(path.join(quarantine, 'pr-241'), 'requires-clean-redeploy\n');
    const docker = makeDockerStub(root);

    const result = run(root, 241, docker, {
      PREVIEW_NOW_EPOCH: '9999999999',
      PREVIEW_INFLIGHT_TTL_SECONDS: '1',
    });

    expect(result.status).toBe(11);
    expect(result.stderr).toContain('quarantined');
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' start');
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' stop');
  });

  test('records the wake lease from the completed wake instead of process startup', () => {
    const root = makeRoot();
    makePreview(root, 241);
    const docker = makeDockerStub(root);
    const calls = path.join(root, 'date-calls');
    const fakeDate = path.join(root, 'date');
    writeFileSync(calls, '0\n');
    writeFileSync(fakeDate, `#!/usr/bin/env bash
count="$(head -1 "$PREVIEW_DATE_CALLS")"
if [[ "$count" == "0" ]]; then
  printf '1\n' > "$PREVIEW_DATE_CALLS"
  printf '1000\n'
else
  printf '1121\n'
fi
`);
    chmodSync(fakeDate, 0o755);

    const result = run(root, 241, docker, {
      PATH: `${root}:${process.env.PATH}`,
      PREVIEW_DATE_CALLS: calls,
    });

    expect(result.status).toBe(0);
    expect(readFileSync(path.join(root, 'wake', 'access', 'pr-241'), 'utf8')).toBe('1121\n');
  });

  test('health-gates a legacy resident through its direct container endpoint', () => {
    const root = makeRoot();
    makePreview(root, 245);
    const docker = makeDockerStub(root, [], 'legacy');
    const curl = path.join(root, 'curl-stub.sh');
    const curlLog = path.join(root, 'curl.log');
    writeFileSync(curlLog, '');
    writeFileSync(curl, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$PREVIEW_CURL_LOG"
printf 'OK\\n'
`);
    chmodSync(curl, 0o755);

    const result = run(root, 245, docker, {
      PREVIEW_CURL: curl,
      PREVIEW_CURL_LOG: curlLog,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('WAKE_RESULT=woken');
    expect(readFileSync(curlLog, 'utf8')).toContain(
      'http://172.18.0.245:8080/api/healthcheck',
    );
  });

  test('at the running cap sleeps the least recently accessed unpinned preview', () => {
    const root = makeRoot();
    makePreview(root, 100, { access: 10, pinned: true });
    makePreview(root, 101, { access: 20 });
    makePreview(root, 102, { access: 30 });
    const docker = makeDockerStub(root, [100, 101]);

    const result = run(root, 102, docker);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('WAKE_SLEPT=101');
    expect(readFileSync(docker.state, 'utf8').trim().split('\n').sort()).toEqual(['100', '102']);
    const log = readFileSync(docker.log, 'utf8');
    expect(log).toContain('compose -p yawp-pr-101');
    expect(log).toContain(' stop');
    expect(log).not.toContain('compose -p yawp-pr-100');
  });

  test('fails closed without mutation when configuration drift is already above the running cap', () => {
    const root = makeRoot();
    makePreview(root, 100, { access: 10 });
    makePreview(root, 101, { access: 20 });
    makePreview(root, 102, { access: 30 });
    makePreview(root, 103, { access: 40 });
    const docker = makeDockerStub(root, [100, 101, 102]);

    const result = run(root, 103, docker);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('above');
    expect(readFileSync(docker.state, 'utf8').trim().split('\n').sort()).toEqual([
      '100',
      '101',
      '102',
    ]);
    const log = readFileSync(docker.log, 'utf8');
    expect(log).not.toContain(' stop');
    expect(log).not.toContain(' start');
  });

  test('fails closed when every running preview is pinned', () => {
    const root = makeRoot();
    makePreview(root, 100, { pinned: true });
    makePreview(root, 101, { pinned: true });
    makePreview(root, 102);
    const docker = makeDockerStub(root, [100, 101]);

    const result = run(root, 102, docker);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('capacity');
    expect(readFileSync(docker.state, 'utf8').trim().split('\n').sort()).toEqual(['100', '101']);
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' start');
  });

  test('sleep kill switch prevents capacity displacement during wake', () => {
    const root = makeRoot();
    makePreview(root, 100, { access: 10 });
    makePreview(root, 101, { access: 20 });
    makePreview(root, 102);
    const docker = makeDockerStub(root, [100, 101]);

    const result = run(root, 102, docker, { PREVIEW_SLEEP_ENABLED: 'false' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('capacity');
    expect(readFileSync(docker.state, 'utf8').trim().split('\n').sort()).toEqual(['100', '101']);
    const log = readFileSync(docker.log, 'utf8');
    expect(log).not.toContain(' stop');
    expect(log).not.toContain(' start');
  });

  test('unauthorized wake cannot displace another preview at capacity', () => {
    const root = makeRoot();
    makePreview(root, 100, { access: 10 });
    makePreview(root, 101, { access: 20 });
    makePreview(root, 102);
    const docker = makeDockerStub(root, [100, 101]);

    const result = run(root, 102, docker, { PREVIEW_WAKE_ALLOW_DISPLACEMENT: 'false' });

    expect(result.status).not.toBe(0);
    expect(readFileSync(docker.state, 'utf8').trim().split('\n').sort()).toEqual(['100', '101']);
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' stop');
  });

  test('rejects malformed PR identifiers before calling Docker', () => {
    const root = makeRoot();
    const docker = makeDockerStub(root);

    const result = run(root, '../241', docker);

    expect(result.status).not.toBe(0);
    expect(readFileSync(docker.log, 'utf8')).toBe('');
  });

  test('does not create a missing or reclaimed environment', () => {
    const root = makeRoot();
    const docker = makeDockerStub(root);

    const result = run(root, 999, docker);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not resident');
    expect(existsSync(path.join(root, 'previews', 'pr-999'))).toBe(false);
    expect(readFileSync(docker.log, 'utf8')).toBe('');
  });

  test('fails when the restarted web container does not become healthy', () => {
    const root = makeRoot();
    makePreview(root, 241);
    const docker = makeDockerStub(root, [], false);

    const result = run(root, 241, docker);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('healthy');
  });

  test('restores the displaced preview when the requested wake is unhealthy', () => {
    const root = makeRoot();
    makePreview(root, 100, { access: 10, pinned: true });
    makePreview(root, 101, { access: 20 });
    makePreview(root, 102, { access: 30 });
    const docker = makeDockerStub(root, [100, 101], 102);

    const result = run(root, 102, docker);

    expect(result.status).not.toBe(0);
    expect(readFileSync(docker.state, 'utf8').trim().split('\n').sort()).toEqual(['100', '101']);
    const log = readFileSync(docker.log, 'utf8');
    expect(log).toContain('compose -p yawp-pr-102');
    expect(log).toContain('compose -p yawp-pr-101');
    expect(log.match(/ start/g)?.length).toBe(2);
  });

  test('restores the displaced preview when the requested Compose start fails', () => {
    const root = makeRoot();
    makePreview(root, 100, { access: 10, pinned: true });
    makePreview(root, 101, { access: 20 });
    makePreview(root, 102, { access: 30 });
    const docker = makeDockerStub(root, [100, 101]);

    const result = run(root, 102, docker, {
      PREVIEW_DOCKER_FAIL_START_PR: '102',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('could not start');
    expect(readFileSync(docker.state, 'utf8').trim().split('\n').sort()).toEqual([
      '100',
      '101',
    ]);
    const log = readFileSync(docker.log, 'utf8');
    expect(log).toContain('compose -p yawp-pr-102');
    expect(log).toContain('compose -p yawp-pr-101');
    expect(log.match(/ start/g)?.length).toBe(2);
  });

  test('refuses a wake whose authorization aged out while queued for the host lock', () => {
    const root = makeRoot();
    makePreview(root, 241);
    const docker = makeDockerStub(root);

    const result = run(root, 241, docker, {
      PREVIEW_NOW_EPOCH: '1031',
      PREVIEW_WAKE_AUTHORIZED_AT_EPOCH: '1000',
      PREVIEW_WAKE_AUTHORIZATION_MAX_QUEUE_SECONDS: '30',
    });

    expect(result.status).toBe(12);
    expect(result.stderr).toContain('authorization expired');
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' stop');
    expect(readFileSync(docker.log, 'utf8')).not.toContain(' start');
  });

  test('revalidates the authoritative seat after the host lock before any mutation', () => {
    const root = makeRoot();
    makePreview(root, 241);
    const docker = makeDockerStub(root);

    const result = run(root, 241, docker, {
      PREVIEW_NOW_EPOCH: '1001',
      PREVIEW_WAKE_AUTHORIZED_AT_EPOCH: '1000',
      PREVIEW_WAKE_AUTHORIZED_ORGANIZATION_ID: 'revoked-while-queued',
      PREVIEW_WAKE_REQUIRE_PREVIEW_SEAT_CODE: 'true',
      PREVIEW_DOCKER_AUTH_CURRENT: 'false',
    });

    expect(result.status).toBe(12);
    expect(result.stderr).toContain('authorization was revoked while queued');
    const log = readFileSync(docker.log, 'utf8');
    expect(log).toContain('SELECT EXISTS');
    expect(log).not.toContain(' stop');
    expect(log).not.toContain(' start');
  });

  test('rejects a queued one-click code after that exact code is rotated', () => {
    const root = makeRoot();
    makePreview(root, 241);
    const docker = makeDockerStub(root);
    const acceptedDigest = createHmac('sha256', 'a'.repeat(64))
      .update('calm-panda-8127')
      .digest('hex');

    const result = run(root, 241, docker, {
      PREVIEW_NOW_EPOCH: '1001',
      PREVIEW_WAKE_AUTHORIZED_AT_EPOCH: '1000',
      PREVIEW_WAKE_AUTHORIZED_ORGANIZATION_ID: 'runtime-seat-2',
      PREVIEW_WAKE_REQUIRE_PREVIEW_SEAT_CODE: 'true',
      PREVIEW_WAKE_AUTHORIZED_CODE_HMAC_SHA256: acceptedDigest,
      PREVIEW_DOCKER_AUTH_CODE: 'rotated-panda-9001',
    });

    expect(result.status).toBe(12);
    expect(result.stderr).toContain('authorization was revoked while queued');
    const log = readFileSync(docker.log, 'utf8');
    expect(log).toContain('SELECT COALESCE');
    expect(log).not.toContain(' stop');
    expect(log).not.toContain(' start');
  });

  test('does not restore a displaced preview until a failed target is confirmed stopped', () => {
    const root = makeRoot();
    makePreview(root, 100, { access: 10, pinned: true });
    makePreview(root, 101, { access: 20 });
    makePreview(root, 102, { access: 30 });
    const docker = makeDockerStub(root, [100, 101], 102);

    const result = run(root, 102, docker, { PREVIEW_DOCKER_FAIL_STOP_PR: '102' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('refusing to restore');
    expect(readFileSync(docker.state, 'utf8').trim().split('\n').sort()).toEqual(['100', '102']);
    const log = readFileSync(docker.log, 'utf8');
    expect(log.match(/ start/g)?.length).toBe(1);
  });

  test('signal cancellation rolls back the target before restoring displacement', async () => {
    const root = makeRoot();
    makePreview(root, 100, { access: 10, pinned: true });
    makePreview(root, 101, { access: 20 });
    makePreview(root, 102, { access: 30 });
    const docker = makeDockerStub(root, [100, 101], 102);
    const child = Bun.spawn(['bash', script, '102'], {
      env: {
        ...process.env,
        PREVIEW_ROOT: root,
        PREVIEW_DOCKER: docker.stub,
        PREVIEW_DOCKER_STATE: docker.state,
        PREVIEW_DOCKER_LOG: docker.log,
        PREVIEW_MAX_RUNNING: '2',
        PREVIEW_WAKE_SKIP_FLOCK: 'true',
        PREVIEW_WAKE_HEALTH_ATTEMPTS: '60',
        PREVIEW_WAKE_HEALTH_INTERVAL_SECONDS: '1',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (readFileSync(docker.state, 'utf8').split('\n').includes('102')) break;
      await Bun.sleep(20);
    }
    child.kill('SIGTERM');
    expect(await child.exited).not.toBe(0);
    expect(readFileSync(docker.state, 'utf8').trim().split('\n').sort()).toEqual(['100', '101']);
  });

  test('signal cancellation during victim stop restores the displaced preview', async () => {
    const root = makeRoot();
    makePreview(root, 100, { access: 10, pinned: true });
    makePreview(root, 101, { access: 20 });
    makePreview(root, 102, { access: 30 });
    const docker = makeDockerStub(root, [100, 101]);
    const stopStarted = path.join(root, 'stop-started');
    const stopRelease = path.join(root, 'stop-release');
    const child = Bun.spawn(['bash', script, '102'], {
      env: {
        ...process.env,
        PREVIEW_ROOT: root,
        PREVIEW_DOCKER: docker.stub,
        PREVIEW_DOCKER_STATE: docker.state,
        PREVIEW_DOCKER_LOG: docker.log,
        PREVIEW_DOCKER_BLOCK_STOP_PR: '101',
        PREVIEW_DOCKER_STOP_STARTED: stopStarted,
        PREVIEW_DOCKER_STOP_RELEASE: stopRelease,
        PREVIEW_MAX_RUNNING: '2',
        PREVIEW_WAKE_SKIP_FLOCK: 'true',
        PREVIEW_WAKE_HEALTH_ATTEMPTS: '2',
        PREVIEW_WAKE_HEALTH_INTERVAL_SECONDS: '0',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    for (let attempt = 0; attempt < 100 && !existsSync(stopStarted); attempt += 1) {
      await Bun.sleep(20);
    }
    expect(existsSync(stopStarted)).toBe(true);
    child.kill('SIGTERM');
    writeFileSync(stopRelease, 'continue\n');

    expect(await child.exited).not.toBe(0);
    expect(readFileSync(docker.state, 'utf8').trim().split('\n').sort()).toEqual(['100', '101']);
    const log = readFileSync(docker.log, 'utf8');
    expect(log).toContain('compose -p yawp-pr-101');
    expect(log).not.toContain('compose -p yawp-pr-102');
  });

  test('protects a newly awakened preview from immediate capacity ping-pong', () => {
    const root = makeRoot();
    makePreview(root, 100, { access: 10, pinned: true });
    makePreview(root, 101, { access: 20 });
    makePreview(root, 102);
    makePreview(root, 103);
    const docker = makeDockerStub(root, [100, 101]);

    const first = run(root, 102, docker, {
      PREVIEW_NOW_EPOCH: '1000',
      PREVIEW_WAKE_LEASE_SECONDS: '120',
    });
    const second = run(root, 103, docker, {
      PREVIEW_NOW_EPOCH: '1001',
      PREVIEW_WAKE_LEASE_SECONDS: '120',
    });

    expect(first.status).toBe(0);
    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain('capacity');
    expect(readFileSync(docker.state, 'utf8').trim().split('\n').sort()).toEqual(['100', '102']);
  });
});
