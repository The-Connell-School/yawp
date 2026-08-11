import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
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
  writeFileSync(docker, '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(docker, 0o755);
  return { root, bin };
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

  test('rejects a malformed target PR', () => {
    const { root, bin } = makePreviewRoot([11]);

    const result = runCleanup(root, bin, { TARGET_PR: '../11' });

    expect(result.exitCode).toBe(1);
    expect(existsSync(path.join(root, 'previews/pr-11'))).toBe(true);
  });
});
