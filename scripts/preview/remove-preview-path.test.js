import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, chmod, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/remove-preview-path.sh');

async function makePreviewTree(slug = 'pr-42') {
  const root = await mkdtemp(path.join(tmpdir(), 'yawp-preview-remove-'));
  const target = path.join(root, 'sources', slug);
  await mkdir(path.join(target, 'services/web-app/.react-router/types'), {
    recursive: true,
  });
  await writeFile(
    path.join(target, 'services/web-app/.react-router/types/routes.ts'),
    'export {}\n'
  );
  return { root, target };
}

/**
 * Stands in for one removal layer: records the arguments it was handed, then
 * either performs the removal or refuses. Lets the tests drive the escalation
 * ladder without depending on the uid running them — a root-owned tree is
 * exactly what the helper exists for, and root can always delete it.
 */
async function makeLayerStub(root, name, { succeed = true } = {}) {
  const logPath = path.join(root, `${name}.log`);
  const stubPath = path.join(root, `${name}.sh`);
  await writeFile(
    stubPath,
    succeed
      ? `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(logPath)}\nexec "$@"\n`
      : `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(logPath)}\nexit 1\n`
  );
  await chmod(stubPath, 0o755);
  return { stubPath, logPath };
}

function runRemove(target, env = {}) {
  return Bun.spawnSync({
    cmd: [
      'bash',
      '-lc',
      `source ${JSON.stringify(scriptPath)}; preview_remove_path "$TARGET"`,
    ],
    env: {
      ...process.env,
      TARGET: target,
      // Never let a test shell out to real sudo or docker.
      PREVIEW_REMOVE_SUDO: 'false',
      PREVIEW_REMOVE_DOCKER: 'false',
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function stderrOf(result) {
  return new TextDecoder().decode(result.stderr);
}

describe('preview_remove_path', () => {
  test('removes a preview tree the deploy user owns', async () => {
    const { target } = await makePreviewTree();

    const result = runRemove(target);

    expect(result.exitCode).toBe(0);
    expect(existsSync(target)).toBe(false);
  });

  test('succeeds when the path is already gone', async () => {
    const { root } = await makePreviewTree();

    const result = runRemove(path.join(root, 'sources', 'pr-999'));

    expect(result.exitCode).toBe(0);
  });

  test('escalates to sudo when a plain rm leaves the tree behind', async () => {
    const { root, target } = await makePreviewTree();
    const { stubPath, logPath } = await makeLayerStub(root, 'sudo');

    const result = runRemove(target, {
      PREVIEW_REMOVE_RM: 'false',
      PREVIEW_REMOVE_SUDO: stubPath,
    });

    expect(result.exitCode).toBe(0);
    expect(await readFile(logPath, 'utf8')).toContain('rm -rf');
    expect(existsSync(target)).toBe(false);
  });

  test('falls back to a root container when sudo is unavailable', async () => {
    const { root, target } = await makePreviewTree();
    const { stubPath: dockerStub, logPath } = await makeLayerStub(
      root,
      'docker',
      { succeed: false }
    );

    const result = runRemove(target, {
      PREVIEW_REMOVE_RM: 'false',
      PREVIEW_REMOVE_SUDO: 'false',
      PREVIEW_REMOVE_DOCKER: dockerStub,
    });

    const dockerArgs = await readFile(logPath, 'utf8');
    expect(dockerArgs).toContain('run --rm');
    expect(dockerArgs).toContain('/preview-target/pr-42');
    // Every layer refused, so the helper reports the tree it could not remove.
    expect(result.exitCode).toBe(1);
    expect(stderrOf(result)).toContain(target);
  });

  test('mounts the parent directory, not the preview tree itself', async () => {
    const { root, target } = await makePreviewTree();
    const { stubPath: dockerStub, logPath } = await makeLayerStub(
      root,
      'docker',
      { succeed: false }
    );

    runRemove(target, {
      PREVIEW_REMOVE_RM: 'false',
      PREVIEW_REMOVE_DOCKER: dockerStub,
    });

    expect(await readFile(logPath, 'utf8')).toContain(
      `${path.join(root, 'sources')}:/preview-target`
    );
  });

  test('refuses paths that are not a pr-<number> preview directory', async () => {
    const { root } = await makePreviewTree();
    const stray = path.join(root, 'sources');

    const result = runRemove(stray);

    expect(result.exitCode).toBe(1);
    expect(stderrOf(result)).toContain('Refusing');
    expect(existsSync(stray)).toBe(true);
  });

  test('refuses a bare slug with no parent directory', async () => {
    const result = runRemove('pr-42');

    expect(result.exitCode).toBe(1);
    expect(stderrOf(result)).toContain('Refusing');
  });

  test('refuses an empty or root path', async () => {
    for (const target of ['/', '']) {
      const result = runRemove(target);
      if (target === '') {
        expect(result.exitCode).toBe(0);
      } else {
        expect(result.exitCode).toBe(1);
        expect(stderrOf(result)).toContain('Refusing');
      }
    }
  });
});
