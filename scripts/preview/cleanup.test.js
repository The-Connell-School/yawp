import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/cleanup.sh');

async function makePreviewRoot(prNumbers) {
  const root = await mkdtemp(path.join(tmpdir(), 'yawp-preview-cleanup-'));
  for (const prNumber of prNumbers) {
    const previewDir = path.join(root, 'previews', `pr-${prNumber}`);
    const sourceDir = path.join(root, 'sources', `pr-${prNumber}`);
    await mkdir(previewDir, { recursive: true });
    await mkdir(path.join(sourceDir, 'services/web-app/.react-router'), {
      recursive: true,
    });
    await writeFile(
      path.join(sourceDir, 'services/web-app/.react-router/types.ts'),
      'export {}\n'
    );
  }

  // Everything docker-side is a no-op; this test is about path removal.
  const binDir = path.join(root, 'bin');
  await mkdir(binDir, { recursive: true });
  const dockerStub = path.join(binDir, 'docker');
  await writeFile(dockerStub, '#!/usr/bin/env bash\nexit 0\n');
  await chmod(dockerStub, 0o755);

  return { root, binDir };
}

/**
 * An rm that refuses the named preview and deletes everything else — the shape
 * of the real failure, where container-written files under one PR's tree are
 * root-owned and the deploy user's rm cannot touch them.
 */
async function makeSelectiveRm(root, refusedSlug) {
  const stubPath = path.join(root, 'selective-rm.sh');
  await writeFile(
    stubPath,
    `#!/usr/bin/env bash\nfor arg in "$@"; do\n  if [[ "$arg" == *${refusedSlug}* ]]; then\n    echo "rm: cannot remove '$arg': Permission denied" >&2\n    exit 1\n  fi\ndone\nexec rm "$@"\n`
  );
  await chmod(stubPath, 0o755);
  return stubPath;
}

function runCleanup(root, binDir, env = {}) {
  return Bun.spawnSync({
    cmd: ['bash', scriptPath],
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      PREVIEW_ROOT: root,
      PREVIEW_TTL_HOURS: '0',
      OPEN_PR_NUMBERS: '',
      // Escalation is not available to the test; only plain rm may succeed.
      PREVIEW_REMOVE_SUDO: 'false',
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

describe('preview cleanup', () => {
  test('removes expired previews and their sources', async () => {
    const { root, binDir } = await makePreviewRoot([11, 12]);

    const result = runCleanup(root, binDir);

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews', 'pr-11'))).toBe(false);
    expect(existsSync(path.join(root, 'sources', 'pr-11'))).toBe(false);
    expect(existsSync(path.join(root, 'sources', 'pr-12'))).toBe(false);
  });

  test('keeps previews for open pull requests', async () => {
    const { root, binDir } = await makePreviewRoot([11, 12]);

    const result = runCleanup(root, binDir, { OPEN_PR_NUMBERS: '11' });

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'previews', 'pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'sources', 'pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'sources', 'pr-12'))).toBe(false);
  });

  test('keeps cleaning after a preview it cannot remove, then reports failure', async () => {
    const { root, binDir } = await makePreviewRoot([11, 12]);
    const selectiveRm = await makeSelectiveRm(root, 'pr-11');

    const result = runCleanup(root, binDir, {
      PREVIEW_REMOVE_RM: selectiveRm,
    });

    // pr-11 is stuck, but pr-12 must still be gone — the whole point.
    expect(existsSync(path.join(root, 'sources', 'pr-11'))).toBe(true);
    expect(existsSync(path.join(root, 'previews', 'pr-12'))).toBe(false);
    expect(existsSync(path.join(root, 'sources', 'pr-12'))).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(textOf(result.stderr)).toContain('pr-11');
  });

  test('does nothing when the preview root has no previews', async () => {
    const { root, binDir } = await makePreviewRoot([]);

    const result = runCleanup(root, binDir);

    expect(result.exitCode).toBe(0);
  });
});
