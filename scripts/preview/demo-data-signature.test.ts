import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/demo-data-signature.sh');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function makeHarness() {
  const root = await mkdtemp(path.join(tmpdir(), 'yawp-demo-signature-'));
  temporaryDirectories.push(root);
  const bin = path.join(root, 'bin');
  const commandLog = path.join(root, 'commands.log');
  await mkdir(bin);
  await writeFile(
    path.join(bin, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'docker' >> "$COMMAND_LOG"
printf ' %q' "$@" >> "$COMMAND_LOG"
printf '\\n' >> "$COMMAND_LOG"
printf '{"organizations":8,"users":18,"classes":15,"assignments":21,"documents":4,"submissions":3,"moduleSessions":2}\\n'
`
  );
  await chmod(path.join(bin, 'docker'), 0o755);
  return {
    commandLog,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      COMMAND_LOG: commandLog,
      DATABASE_NAME: 'yawp_demo',
      PREVIEW_POSTGRES_CONTAINER: 'preview-postgres',
    },
  };
}

function run(env: Record<string, string | undefined>) {
  return Bun.spawnSync({
    cmd: ['bash', scriptPath],
    cwd: path.resolve('.'),
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

describe('demo data signature', () => {
  test('reports only aggregate counts from durable demo tables', async () => {
    const harness = await makeHarness();
    const result = run(harness.env);

    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout).trim()).toBe(
      '{"organizations":8,"users":18,"classes":15,"assignments":21,"documents":4,"submissions":3,"moduleSessions":2}'
    );
    const commands = await readFile(harness.commandLog, 'utf8');
    for (const table of [
      'Organization',
      'User',
      'Class',
      'Assignment',
      'Document',
      'Submission',
      'AssignmentModuleSession',
    ]) {
      expect(commands).toContain(table);
    }
    expect(commands).not.toContain('SELECT id');
  });

  test('refuses any database except yawp_demo before Docker access', async () => {
    const harness = await makeHarness();
    const result = run({ ...harness.env, DATABASE_NAME: 'yawp_pr_241' });

    expect(result.exitCode).not.toBe(0);
    expect(await readFile(harness.commandLog, 'utf8').catch(() => '')).toBe('');
  });
});
