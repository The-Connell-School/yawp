import { createHash } from 'node:crypto';
import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/restore-demo-backup.sh');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function makeHarness() {
  const root = await mkdtemp(path.join(tmpdir(), 'yawp-demo-restore-'));
  temporaryDirectories.push(root);
  const bin = path.join(root, 'bin');
  const backupDir = path.join(root, 'backups');
  const commandLog = path.join(root, 'commands.log');
  const filename = 'yawp_demo-pre-reset-20260817T030000Z.dump';
  const backupFile = path.join(backupDir, filename);
  const contents = 'verified recovery dump\n';
  const checksum = createHash('sha256').update(contents).digest('hex');
  await mkdir(bin);
  await mkdir(backupDir);
  await writeFile(backupFile, contents);
  await writeFile(`${backupFile}.sha256`, `${checksum}  ${filename}\n`);
  await writeFile(
    path.join(bin, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'docker' >> "$COMMAND_LOG"
printf ' %q' "$@" >> "$COMMAND_LOG"
printf '\n' >> "$COMMAND_LOG"
if [[ " $* " == *" pg_restore "* ]]; then cat >/dev/null; fi
if [[ " $* " == *" SELECT 1 FROM pg_database "* ]]; then printf '1\n'; fi
`
  );
  await chmod(path.join(bin, 'docker'), 0o755);

  return {
    root,
    backupFile,
    commandLog,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      COMMAND_LOG: commandLog,
      PREVIEW_ROOT: root,
      BACKUP_FILE: backupFile,
      DATABASE_NAME: 'yawp_demo',
      DATABASE_USER: 'yawp_demo_app',
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

describe('failed demo reset recovery', () => {
  test('replaces the partial database from the verified pre-reset dump', async () => {
    const harness = await makeHarness();
    const result = run(harness.env);

    expect(result.exitCode).toBe(0);
    const commands = await readFile(harness.commandLog, 'utf8');
    expect(commands).toContain('pg_restore --list');
    expect(commands).toContain(
      'createdb -U postgres -O yawp_demo_app yawp_demo_recovery_'
    );
    expect(commands).toContain(
      'pg_restore -U postgres -d yawp_demo_recovery_'
    );
    expect(commands).toContain(
      'ALTER\\ DATABASE\\ \\"yawp_demo\\"\\ RENAME\\ TO'
    );
    expect(commands).toContain('RENAME\\ TO\\ \\"yawp_demo\\"');
    expect(
      commands
        .split('\n')
        .filter((line) => line.includes('ALTER\\ DATABASE')).length
    ).toBe(1);
    expect(commands).not.toContain(
      'dropdb -U postgres --force --if-exists yawp_demo\n'
    );
  });

  test('refuses a scheduled backup or mismatched checksum before database deletion', async () => {
    const harness = await makeHarness();
    const wrongKind = run({
      ...harness.env,
      BACKUP_FILE: harness.backupFile.replace('-pre-reset-', '-scheduled-'),
    });
    expect(wrongKind.exitCode).not.toBe(0);

    await writeFile(
      `${harness.backupFile}.sha256`,
      `${'0'.repeat(64)}  invalid.dump\n`
    );
    const badChecksum = run(harness.env);
    expect(badChecksum.exitCode).not.toBe(0);
    expect(await readFile(harness.commandLog, 'utf8').catch(() => '')).toBe('');
  });
});
