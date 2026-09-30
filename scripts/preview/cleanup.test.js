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

  const bin = path.join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  const docker = path.join(bin, 'docker');
  const dockerLog = path.join(root, 'docker.log');
  writeFileSync(dockerLog, '');
  writeFileSync(docker, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$PREVIEW_DOCKER_LOG"
# Simulate compose down failure
if [[ "$1" == "compose" && "\${PREVIEW_DOCKER_FAIL_DOWN:-false}" == "true" ]]; then exit 1; fi
# Simulate dropdb/dropuser failure
if [[ "$1" == "exec" && "\${PREVIEW_DOCKER_FAIL_DROPDB:-false}" == "true" ]]; then exit 1; fi
# Simulate non-empty resource listings during fallback verification
if [[ "$1" == "ps" && "$2" == "-aq" ]]; then
  if [[ "\${PREVIEW_DOCKER_NONEMPTY:-}" == "ps" || "\${PREVIEW_DOCKER_NONEMPTY:-}" == "any" ]]; then
    echo id-ps
  fi
fi
if [[ "$1" == "volume" && "$2" == "ls" && "$3" == "-q" ]]; then
  if [[ "\${PREVIEW_DOCKER_NONEMPTY:-}" == "volume" || "\${PREVIEW_DOCKER_NONEMPTY:-}" == "any" ]]; then
    echo id-volume
  fi
fi
if [[ "$1" == "network" && "$2" == "ls" && "$3" == "-q" ]]; then
  if [[ "\${PREVIEW_DOCKER_NONEMPTY:-}" == "network" || "\${PREVIEW_DOCKER_NONEMPTY:-}" == "any" ]]; then
    echo id-network
  fi
fi
exit 0
`);
  chmodSync(docker, 0o755);
  return { root, bin, dockerLog };
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

function runCleanup(root, bin, env = {}) {
  return Bun.spawnSync({
    cmd: ['bash', script],
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      PREVIEW_ROOT: root,
      PREVIEW_TTL_HOURS: '0',
      OPEN_PR_NUMBERS: '',
      PREVIEW_REMOVE_DOCKER: 'false',
      PREVIEW_DOCKER_LOG: path.join(root, 'docker.log'),
      ...env,
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
    const { root, bin } = makePreviewRoot([11, 12]);

    const result = runCleanup(root, bin);

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(false);
    expect(existsSync(path.join(root, 'sources/pr-11'))).toBe(false);
    expect(existsSync(path.join(root, 'previews/pr-12'))).toBe(false);
    expect(existsSync(path.join(root, 'sources/pr-12'))).toBe(false);
  });

  test('keeps open pull requests', () => {
    const { root, bin } = makePreviewRoot([11, 12]);

    const result = runCleanup(root, bin, { OPEN_PR_NUMBERS: '11' });

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'sources/pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'previews/pr-12'))).toBe(false);
  });

  test('continues after one stuck path, then reports failure', () => {
    const { root, bin } = makePreviewRoot([11, 12]);
    const selectiveRm = makeSelectiveRm(root, 'pr-11');

    const result = runCleanup(root, bin, {
      PREVIEW_REMOVE_RM: selectiveRm,
    });

    expect(result.exitCode).toBe(1);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'previews/pr-12'))).toBe(false);
    expect(existsSync(path.join(root, 'sources/pr-12'))).toBe(false);
    expect(textOf(result.stderr)).toContain('pr-11');
  });

  test('targeted cleanup removes only the closed PR from the event', () => {
    const { root, bin } = makePreviewRoot([11, 12]);

    const result = runCleanup(root, bin, {
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
    const { root, bin } = makePreviewRoot([11]);
    const marker = path.join(root, 'inflight', 'pr-11', '1000-1');
    mkdirSync(path.dirname(marker), { recursive: true });
    writeFileSync(marker, '');

    const result = runCleanup(root, bin, {
      TARGET_PR: '11',
      PREVIEW_INFLIGHT_TTL_SECONDS: '3600',
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'sources/pr-11'))).toBe(true);
    expect(textOf(result.stdout)).toContain('deployment is in flight');
  });

  test('rejects a malformed target PR', () => {
    const { root, bin } = makePreviewRoot([11]);

    const result = runCleanup(root, bin, { TARGET_PR: '../11' });

    expect(result.exitCode).toBe(1);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(true);
  });

  test('tolerates compose down failure by falling back to forced removal', () => {
    const { root, bin } = makePreviewRoot([11]);

    const result = runCleanup(root, bin, { PREVIEW_DOCKER_FAIL_DOWN: 'true' });

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(false);
    expect(existsSync(path.join(root, 'sources/pr-11'))).toBe(false);
  });

  test('keeps retry metadata when database teardown fails', () => {
    const { root, bin } = makePreviewRoot([11]);

    const result = runCleanup(root, bin, { PREVIEW_DOCKER_FAIL_DROPDB: 'true' });

    expect(result.exitCode).toBe(1);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'sources/pr-11'))).toBe(true);
  });

  test('falls back to forced removal with strict label filters and succeeds', () => {
    const { root, bin, dockerLog } = makePreviewRoot([11]);
    const result = runCleanup(root, bin, {
      PREVIEW_DOCKER_FAIL_DOWN: 'true',
    });
    // Fallback should succeed with empty resource listings; environment removed.
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(false);
    // Validate filters were by label, never by name.
    const log = textOf(readFileSync(dockerLog));
    expect(log).toContain(
      'ps -aq --filter label=com.docker.compose.project=yawp-pr-11',
    );
    expect(log).toContain(
      'volume ls -q --filter label=com.docker.compose.project=yawp-pr-11',
    );
    expect(log).toContain(
      'network ls -q --filter label=com.docker.compose.project=yawp-pr-11',
    );
    expect(log).not.toMatch(/--filter name=/);
  });

  test('pr-1 vs pr-12 collision: never uses name filters (substring hazard)', () => {
    const { root, bin, dockerLog } = makePreviewRoot([1, 12]);
    const result = runCleanup(root, bin, {
      PREVIEW_DOCKER_FAIL_DOWN: 'true',
    });
    expect(result.exitCode).toBe(0);
    const log = textOf(readFileSync(dockerLog));
    // Ensure we only used strict label filters for the target pr-1 project.
    expect(log).toContain(
      'ps -aq --filter label=com.docker.compose.project=yawp-pr-1',
    );
    expect(log).not.toMatch(/--filter name=.*yawp-pr-1/);
  });

  test('fallback verification fails when resources remain; compose file is kept', () => {
    const { root, bin } = makePreviewRoot([11]);
    const composeFile = path.join(root, 'previews', 'pr-11', 'docker-compose.yml');
    const result = runCleanup(root, bin, {
      PREVIEW_DOCKER_FAIL_DOWN: 'true',
      PREVIEW_DOCKER_NONEMPTY: 'any',
    });
    expect(result.exitCode).toBe(1);
    // Compose file must not be deleted when resources remain.
    expect(existsSync(composeFile)).toBe(true);
    // Retry metadata retained.
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'sources/pr-11'))).toBe(true);
  });
});
