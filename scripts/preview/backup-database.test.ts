import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/backup-database.sh');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function makeHarness(options: { restoreFails?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'yawp-demo-backup-'));
  temporaryDirectories.push(root);
  const bin = path.join(root, 'bin');
  const commandLog = path.join(root, 'commands.log');
  await mkdir(bin);

  const docker = path.join(bin, 'docker');
  await writeFile(
    docker,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'docker' >> "$COMMAND_LOG"
printf ' %q' "$@" >> "$COMMAND_LOG"
printf '\n' >> "$COMMAND_LOG"
if [[ " $* " == *" pg_dump "* ]]; then
  printf 'valid custom dump\n'
elif [[ " $* " == *" pg_restore "* ]]; then
  cat >/dev/null
  if [[ " $* " == *" --exit-on-error "* ]]; then
    ${options.restoreFails ? 'exit 42' : 'exit 0'}
  fi
fi
`
  );
  await chmod(docker, 0o755);
  const flock = path.join(bin, 'flock');
  await writeFile(flock, '#!/usr/bin/env bash\nexit 0\n');
  await chmod(flock, 0o755);

  return {
    root,
    commandLog,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      COMMAND_LOG: commandLog,
      PREVIEW_ROOT: root,
      DATABASE_NAME: 'yawp_demo',
      PREVIEW_POSTGRES_CONTAINER: 'preview-postgres',
      BACKUP_RETENTION_COUNT: '2',
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

function output(result: ReturnType<typeof run>) {
  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

describe('preview database backups', () => {
  test('creates an atomic validated dump and checksum', async () => {
    const harness = await makeHarness();
    const result = run({
      ...harness.env,
      BACKUP_TIMESTAMP: '20260817T030000Z',
    });
    const { stdout, stderr } = output(result);

    expect(result.exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain(
      'BACKUP_FILE=' +
        path.join(
          harness.root,
          'backups',
          'yawp_demo-scheduled-20260817T030000Z.dump'
        )
    );

    const files = await readdir(path.join(harness.root, 'backups'));
    expect(files).toContain('yawp_demo-scheduled-20260817T030000Z.dump');
    expect(files).toContain(
      'yawp_demo-scheduled-20260817T030000Z.dump.sha256'
    );
    expect(files.some((file) => file.endsWith('.partial'))).toBe(false);

    const commands = await readFile(harness.commandLog, 'utf8');
    expect(commands).toContain(
      'docker exec preview-postgres pg_dump -U postgres -d yawp_demo --format=custom --no-owner --no-acl'
    );
    expect(commands).toContain(
      'docker exec -i preview-postgres pg_restore --list'
    );
    expect(commands).toContain(
      'docker exec preview-postgres createdb -U postgres'
    );
    expect(commands).toContain('--exit-on-error --no-owner --no-acl');
    expect(commands).toContain(
      'docker exec preview-postgres dropdb -U postgres --force --if-exists'
    );
  });

  test('retains only the newest configured scheduled dumps', async () => {
    const harness = await makeHarness();
    const backupDir = path.join(harness.root, 'backups');
    await mkdir(backupDir);
    await writeFile(
      path.join(backupDir, 'yawp_demo-pre-reset-20260801T000000Z.dump'),
      'manual rollback\n'
    );

    for (const timestamp of [
      '20260815T030000Z',
      '20260816T030000Z',
      '20260817T030000Z',
    ]) {
      const result = run({ ...harness.env, BACKUP_TIMESTAMP: timestamp });
      expect(result.exitCode).toBe(0);
    }

    const dumps = (await readdir(backupDir))
      .filter((file) => file.endsWith('.dump'))
      .sort();
    expect(dumps).toEqual([
      'yawp_demo-pre-reset-20260801T000000Z.dump',
      'yawp_demo-scheduled-20260816T030000Z.dump',
      'yawp_demo-scheduled-20260817T030000Z.dump',
    ]);
  });

  test('does not publish or rotate when dump validation fails', async () => {
    const harness = await makeHarness({ restoreFails: true });
    const backupDir = path.join(harness.root, 'backups');
    await mkdir(backupDir);
    await writeFile(
      path.join(backupDir, 'yawp_demo-scheduled-20260816T030000Z.dump'),
      'known good\n'
    );

    const result = run({
      ...harness.env,
      BACKUP_TIMESTAMP: '20260817T030000Z',
      BACKUP_RETENTION_COUNT: '1',
    });

    expect(result.exitCode).not.toBe(0);
    expect((await readdir(backupDir)).filter((file) => !file.startsWith('.'))).toEqual([
      'yawp_demo-scheduled-20260816T030000Z.dump',
    ]);
    expect(await readFile(harness.commandLog, 'utf8')).toContain(
      '--exit-on-error --no-owner --no-acl'
    );
  });

  test('rejects unsafe database names and invalid retention before docker', async () => {
    const harness = await makeHarness();
    for (const env of [
      { ...harness.env, DATABASE_NAME: 'yawp_demo;drop database postgres' },
      { ...harness.env, BACKUP_RETENTION_COUNT: '0' },
      { ...harness.env, BACKUP_RETENTION_COUNT: 'all' },
    ]) {
      const result = run(env);
      expect(result.exitCode).not.toBe(0);
    }
    expect(await readFile(harness.commandLog, 'utf8').catch(() => '')).toBe('');
  });
});
