import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/tooling-artifacts.sh');

async function makePreviewSource() {
  const sourceDir = await mkdtemp(path.join(tmpdir(), 'yawp-preview-artifacts-'));
  await mkdir(path.join(sourceDir, 'node_modules'), { recursive: true });
  await mkdir(path.join(sourceDir, 'services/web-app/node_modules'), { recursive: true });
  await mkdir(path.join(sourceDir, 'packages/prisma/generated/prisma'), { recursive: true });
  await writeFile(path.join(sourceDir, 'packages/prisma/generated/prisma/index.js'), 'module.exports = {}\n');
  return sourceDir;
}

function runArtifactCheck(sourceDir) {
  return Bun.spawnSync({
    cmd: ['bash', '-lc', `source ${JSON.stringify(scriptPath)}; preview_tooling_artifacts_ready "$SOURCE_DIR"`],
    env: {
      ...process.env,
      SOURCE_DIR: sourceDir,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function listMissingArtifacts(sourceDir) {
  const result = Bun.spawnSync({
    cmd: ['bash', '-lc', `source ${JSON.stringify(scriptPath)}; preview_missing_tooling_artifacts "$SOURCE_DIR"`],
    env: {
      ...process.env,
      SOURCE_DIR: sourceDir,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return new TextDecoder().decode(result.stdout).trim().split('\n').filter(Boolean);
}

describe('preview tooling artifact checks', () => {
  test('passes when install and generated Prisma artifacts are present', async () => {
    const sourceDir = await makePreviewSource();

    expect(runArtifactCheck(sourceDir).exitCode).toBe(0);
    expect(listMissingArtifacts(sourceDir)).toEqual([]);
  });

  test('fails when rsync removed the generated Prisma client', async () => {
    const sourceDir = await makePreviewSource();
    await Bun.$`rm ${path.join(sourceDir, 'packages/prisma/generated/prisma/index.js')}`.quiet();

    expect(runArtifactCheck(sourceDir).exitCode).toBe(1);
    expect(listMissingArtifacts(sourceDir)).toContain('packages/prisma/generated/prisma/index.js');
  });

  test('fails when the root install volume is missing', async () => {
    const sourceDir = await makePreviewSource();
    await Bun.$`rm -r ${path.join(sourceDir, 'node_modules')}`.quiet();

    expect(runArtifactCheck(sourceDir).exitCode).toBe(1);
    expect(listMissingArtifacts(sourceDir)).toContain('node_modules');
  });
});
