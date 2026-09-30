import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.join(import.meta.dir, 'cleanup.sh');
const roots = [];

function makeDockerStub(root, runningPrs = []) {
  const state = path.join(root, 'running-prs.txt');
  const volState = path.join(root, 'vol-state.txt');
  const netState = path.join(root, 'net-state.txt');
  const log = path.join(root, 'docker.log');
  const stub = path.join(root, 'docker-stub.sh');
  writeFileSync(state, `${runningPrs.join('\n')}${runningPrs.length ? '\n' : ''}`);
  writeFileSync(volState, '');
  writeFileSync(netState, '');
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
if [[ "$1" == "volume" && "$2" == "ls" && "$3" == "-q" && "$*" =~ com.docker.compose.project=yawp-pr-([0-9]+) ]]; then
  pr="\${BASH_REMATCH[1]}"
  if grep -qx "$pr" "$PREVIEW_DOCKER_VOL_STATE" 2>/dev/null; then
    echo "vol-yawp-pr-$pr"
  fi
  exit 0
fi
if [[ "$1" == "network" && "$2" == "ls" && "$3" == "-q" && "$*" =~ com.docker.compose.project=yawp-pr-([0-9]+) ]]; then
  pr="\${BASH_REMATCH[1]}"
  if grep -qx "$pr" "$PREVIEW_DOCKER_NET_STATE" 2>/dev/null; then
    echo "net-yawp-pr-$pr"
  fi
  exit 0
fi
if [[ "$1" == "volume" && "$2" == "rm" && "$3" =~ ^vol-yawp-pr-([0-9]+)$ ]]; then
  pr="\${BASH_REMATCH[1]}"
  if [[ "$PREVIEW_DOCKER_PERSIST_RESOURCES_FOR_PR" == "$pr" ]]; then
    exit 0
  fi
  awk -v pr="$pr" '$0 != pr' "$PREVIEW_DOCKER_VOL_STATE" > "$PREVIEW_DOCKER_VOL_STATE.next"
  mv "$PREVIEW_DOCKER_VOL_STATE.next" "$PREVIEW_DOCKER_VOL_STATE"
  exit 0
fi
if [[ "$1" == "network" && "$2" == "rm" && "$3" =~ ^net-yawp-pr-([0-9]+)$ ]]; then
  pr="\${BASH_REMATCH[1]}"
  if [[ "$PREVIEW_DOCKER_PERSIST_RESOURCES_FOR_PR" == "$pr" ]]; then
    exit 0
  fi
  awk -v pr="$pr" '$0 != pr' "$PREVIEW_DOCKER_NET_STATE" > "$PREVIEW_DOCKER_NET_STATE.next"
  mv "$PREVIEW_DOCKER_NET_STATE.next" "$PREVIEW_DOCKER_NET_STATE"
  exit 0
fi
if [[ "$1" == "rm" && "$2" == "-f" ]]; then
  shift 2
  for id in "$@"; do
    if [[ "$id" =~ ^container-([0-9]+)$ ]]; then
      pr="\${BASH_REMATCH[1]}"
      awk -v pr="$pr" '$0 != pr' "$PREVIEW_DOCKER_STATE" > "$PREVIEW_DOCKER_STATE.next"
      mv "$PREVIEW_DOCKER_STATE.next" "$PREVIEW_DOCKER_STATE"
    fi
  done
  exit 0
fi
if [[ "$1" == "compose" && "$*" == *" down"* ]]; then
  if [[ "$*" =~ -p[[:space:]]+yawp-pr-([0-9]+) ]]; then
    pr="\${BASH_REMATCH[1]}"
    [[ "\${PREVIEW_DOCKER_FAIL_DOWN_PR:-}" == "$pr" ]] && exit 1
  fi
  exit 0
fi
if [[ "$1" == "exec" && "\${PREVIEW_DOCKER_FAIL_DROPDB:-false}" == "true" ]]; then
  exit 1
fi
if [[ "$1" == "inspect" ]]; then
  [[ "\${PREVIEW_DOCKER_INSPECT_OK:-false}" == "true" ]] && exit 0 || exit 1
fi
exit 0
`
  );
  chmodSync(stub, 0o755);
  return { stub, state, volState, netState, log };
}

function makePreviewRoot(prNumbers) {
  const root = mkdtempSync(path.join(tmpdir(), 'yawp-preview-cleanup-'));
  roots.push(root);

  for (const pr of prNumbers) {
    const preview = path.join(root, 'previews', `pr-${pr}`);
    const source = path.join(root, 'sources', `pr-${pr}`);
    mkdirSync(preview, { recursive: true });
    mkdirSync(path.join(source, 'services/web-app/.react-router'), {
      recursive: true,
    });
    writeFileSync(path.join(preview, 'docker-compose.yml'), 'services: {}\n');
    writeFileSync(
      path.join(source, 'services/web-app/.react-router/types.ts'),
      'export {}\n'
    );
  }

  return { root };
}

function makeSelectiveRm(root, refusedSlug) {
  const stub = path.join(root, 'selective-rm.sh');
  writeFileSync(
    stub,
    `#!/usr/bin/env bash\nfor arg in "$@"; do\n  if [[ "$arg" == *${refusedSlug}* ]]; then\n    exit 1\n  fi\ndone\nexec rm "$@"\n`
  );
  chmodSync(stub, 0o755);
  return stub;
}

function runCleanup(root, extraEnv = {}) {
  return Bun.spawnSync({
    cmd: ['bash', script],
    env: {
      ...process.env,
      PREVIEW_ROOT: root,
      PREVIEW_TTL_HOURS: '0',
      OPEN_PR_NUMBERS: '',
      PREVIEW_REMOVE_DOCKER: 'false',
      ...extraEnv,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function textOf(buffer) {
  return new TextDecoder().decode(buffer);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('preview cleanup', () => {
  test('removes expired previews and sources', () => {
    const { root } = makePreviewRoot([11, 12]);

    const result = runCleanup(root);

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(false);
    expect(existsSync(path.join(root, 'sources/pr-11'))).toBe(false);
    expect(existsSync(path.join(root, 'previews/pr-12'))).toBe(false);
    expect(existsSync(path.join(root, 'sources/pr-12'))).toBe(false);
  });

  test('keeps open pull requests', () => {
    const { root } = makePreviewRoot([11, 12]);

    const result = runCleanup(root, { OPEN_PR_NUMBERS: '11' });

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'sources/pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'previews/pr-12'))).toBe(false);
  });

  test('continues after one stuck path, then reports failure', () => {
    const { root } = makePreviewRoot([11, 12]);
    const selectiveRm = makeSelectiveRm(root, 'pr-11');

    const result = runCleanup(root, {
      PREVIEW_REMOVE_RM: selectiveRm,
    });

    expect(result.exitCode).toBe(1);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'previews/pr-12'))).toBe(false);
    expect(existsSync(path.join(root, 'sources/pr-12'))).toBe(false);
    expect(textOf(result.stderr)).toContain('pr-11');
  });

  test('targeted cleanup removes only the closed PR from the event', () => {
    const { root } = makePreviewRoot([11, 12]);

    const result = runCleanup(root, {
      TARGET_PR: '11',
      PREVIEW_TTL_HOURS: '72',
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(false);
    expect(existsSync(path.join(root, 'sources/pr-11'))).toBe(false);
    expect(existsSync(path.join(root, 'previews/pr-12'))).toBe(true);
    expect(existsSync(path.join(root, 'sources/pr-12'))).toBe(true);
  });

  test('targeted cleanup defers while a deploy marker is fresh', () => {
    const { root } = makePreviewRoot([11]);
    const marker = path.join(root, 'inflight', 'pr-11', '1000-1');
    mkdirSync(path.dirname(marker), { recursive: true });
    writeFileSync(marker, '');

    const result = runCleanup(root, {
      TARGET_PR: '11',
      PREVIEW_INFLIGHT_TTL_SECONDS: '3600',
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'sources/pr-11'))).toBe(true);
    expect(textOf(result.stdout)).toContain('deployment is in flight');
  });

  test('rejects a malformed target PR', () => {
    const { root } = makePreviewRoot([11]);

    const result = runCleanup(root, { TARGET_PR: '../11' });

    expect(result.exitCode).toBe(1);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(true);
  });

  test('tolerates compose down failure by falling back to forced removal', () => {
    const { root } = makePreviewRoot([11]);
    const docker = makeDockerStub(root, [1]);
    // Seed leftover resources; compose down will fail and fallback will remove them.
    writeFileSync(docker.volState, '11\n', { flag: 'a' });
    writeFileSync(docker.netState, '11\n', { flag: 'a' });
    const result = runCleanup(root, {
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_STATE: docker.state,
      PREVIEW_DOCKER_VOL_STATE: docker.volState,
      PREVIEW_DOCKER_NET_STATE: docker.netState,
      PREVIEW_DOCKER_LOG: docker.log,
      PREVIEW_DOCKER_FAIL_DOWN_PR: '11',
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(false);
    expect(existsSync(path.join(root, 'sources/pr-11'))).toBe(false);
  });

  test('keeps retry metadata when database teardown fails', () => {
    const { root } = makePreviewRoot([11]);
    const docker = makeDockerStub(root);

    const result = runCleanup(root, {
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_LOG: docker.log,
      PREVIEW_DOCKER_INSPECT_OK: 'true',
      PREVIEW_DOCKER_FAIL_DROPDB: 'true',
    });

    expect(result.exitCode).toBe(1);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'sources/pr-11'))).toBe(true);
  });

  test('falls back to forced removal with strict label filters and succeeds', () => {
    const { root } = makePreviewRoot([11]);
    const docker = makeDockerStub(root);
    writeFileSync(docker.volState, '11\n', { flag: 'a' });
    writeFileSync(docker.netState, '11\n', { flag: 'a' });
    const result = runCleanup(root, {
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_STATE: docker.state,
      PREVIEW_DOCKER_VOL_STATE: docker.volState,
      PREVIEW_DOCKER_NET_STATE: docker.netState,
      PREVIEW_DOCKER_LOG: docker.log,
      PREVIEW_DOCKER_FAIL_DOWN_PR: '11',
    });
    // Fallback should succeed with empty resource listings; environment removed.
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(false);
    // Validate filters were by label, never by name.
    const log = readFileSync(docker.log, 'utf8');
    const lines = log.trim().split('\n');
    expect(lines).toContain('ps -aq --filter label=com.docker.compose.project=yawp-pr-11');
    expect(lines).toContain('volume ls -q --filter label=com.docker.compose.project=yawp-pr-11');
    expect(lines).toContain('network ls -q --filter label=com.docker.compose.project=yawp-pr-11');
    expect(log).not.toMatch(/--filter name=/);
    expect(log).toContain('volume rm vol-yawp-pr-11');
    expect(log).toContain('network rm net-yawp-pr-11');
  });

  test('pr-1 vs pr-12 collision: never uses name filters (substring hazard)', () => {
    const { root } = makePreviewRoot([1, 12]);
    const docker = makeDockerStub(root);
    // Only seed resources for pr-1; pr-12 should remain untouched.
    writeFileSync(docker.volState, '1\n', { flag: 'a' });
    writeFileSync(docker.netState, '1\n', { flag: 'a' });
    const result = runCleanup(root, {
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_STATE: docker.state,
      PREVIEW_DOCKER_VOL_STATE: docker.volState,
      PREVIEW_DOCKER_NET_STATE: docker.netState,
      PREVIEW_DOCKER_LOG: docker.log,
      PREVIEW_DOCKER_FAIL_DOWN_PR: '1',
    });
    expect(result.exitCode).toBe(0);
    const log = readFileSync(docker.log, 'utf8');
    // Ensure we only used strict label filters for the target pr-1 project.
    const lines = log.trim().split('\n');
    expect(lines).toContain('ps -aq --filter label=com.docker.compose.project=yawp-pr-1');
    expect(lines).not.toContain('ps -aq --filter label=com.docker.compose.project=yawp-pr-12');
    expect(log).not.toMatch(/--filter name=.*yawp-pr-1/);
    // Ensure no container removals for pr-12; pr-1 fallback executed but container removal may be a no-op.
    expect(log).not.toContain('rm -f container-12');
  });

  test('fallback verification fails when resources remain; compose file is kept', () => {
    const { root } = makePreviewRoot([11]);
    const docker = makeDockerStub(root);
    const composeFile = path.join(root, 'previews', 'pr-11', 'docker-compose.yml');
    // Seed resources and persist them despite rm attempts
    writeFileSync(docker.volState, '11\n', { flag: 'a' });
    writeFileSync(docker.netState, '11\n', { flag: 'a' });
    const result = runCleanup(root, {
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_STATE: docker.state,
      PREVIEW_DOCKER_VOL_STATE: docker.volState,
      PREVIEW_DOCKER_NET_STATE: docker.netState,
      PREVIEW_DOCKER_PERSIST_RESOURCES_FOR_PR: '11',
      PREVIEW_DOCKER_LOG: docker.log,
      PREVIEW_DOCKER_FAIL_DOWN_PR: '11',
    });
    expect(result.exitCode).toBe(1);
    // Compose file must not be deleted when resources remain.
    expect(existsSync(composeFile)).toBe(true);
    // Retry metadata retained.
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'sources/pr-11'))).toBe(true);
  });

  test('no-compose-file branch force-removes leftovers by label and succeeds', () => {
    const { root } = makePreviewRoot([11]);
    const docker = makeDockerStub(root);
    // Remove compose file to exercise no-compose branch; seed leftovers.
    rmSync(path.join(root, 'previews', 'pr-11', 'docker-compose.yml'));
    writeFileSync(docker.volState, '11\n', { flag: 'a' });
    writeFileSync(docker.netState, '11\n', { flag: 'a' });
    const result = runCleanup(root, {
      PREVIEW_DOCKER: docker.stub,
      PREVIEW_DOCKER_STATE: docker.state,
      PREVIEW_DOCKER_VOL_STATE: docker.volState,
      PREVIEW_DOCKER_NET_STATE: docker.netState,
      PREVIEW_DOCKER_LOG: docker.log,
    });
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(false);
    const log = readFileSync(docker.log, 'utf8');
    const lines = log.trim().split('\n');
    expect(lines).toContain('ps -aq --filter label=com.docker.compose.project=yawp-pr-11');
    expect(log).toContain('volume rm vol-yawp-pr-11');
    expect(log).toContain('network rm net-yawp-pr-11');
  });
});
