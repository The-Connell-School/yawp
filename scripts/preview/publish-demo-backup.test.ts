import { createHash } from 'node:crypto';
import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/publish-demo-backup.sh');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function makeHarness({ versioning = 'Enabled' } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'yawp-demo-publish-'));
  temporaryDirectories.push(root);
  const bin = path.join(root, 'bin');
  const backupDir = path.join(root, 'backups');
  const commandLog = path.join(root, 'commands.log');
  const filename = 'yawp_demo-scheduled-20260817T030000Z.dump';
  const backupFile = path.join(backupDir, filename);
  const contents = 'restore-tested demo backup\n';
  const checksum = createHash('sha256').update(contents).digest('hex');
  await mkdir(bin);
  await mkdir(backupDir);
  await writeFile(backupFile, contents);
  await writeFile(`${backupFile}.sha256`, `${checksum}  ${filename}\n`);

  const aws = path.join(bin, 'aws');
  await writeFile(
    aws,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'aws' >> "$COMMAND_LOG"
printf ' %q' "$@" >> "$COMMAND_LOG"
printf '\n' >> "$COMMAND_LOG"
if [[ " $* " == *" s3api get-bucket-versioning "* ]]; then
  printf '${versioning}\n'
elif [[ " $* " == *" s3api list-object-versions "* ]]; then
  prefix=''
  previous=''
  for argument in "$@"; do
    if [[ "$previous" == "--prefix" ]]; then prefix="$argument"; break; fi
    previous="$argument"
  done
  if [[ "$prefix" == "demo-backups/" ]]; then
    printf '%s\t%s\t%s\t%s\n' \
      'demo-backups/yawp_demo-scheduled-20260817T030000Z.dump' \
      'demo-backups/yawp_demo-scheduled-20260817T030000Z.dump.sha256' \
      'demo-backups/yawp_demo-scheduled-20260816T030000Z.dump' \
      'demo-backups/yawp_demo-scheduled-20260816T030000Z.dump.sha256'
  else
    printf '%s\tv1\n' "$prefix"
  fi
fi
`
  );
  await chmod(aws, 0o755);

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
      BACKUP_S3_URI: 's3://yawp-preview-videos/demo-backups',
      BACKUP_RETENTION_COUNT: '1',
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

describe('demo backup off-host publishing', () => {
  test('checks versioning, uploads encrypted files, and fully deletes expired versions', async () => {
    const harness = await makeHarness();
    const result = run(harness.env);

    expect({
      exitCode: result.exitCode,
      stderr: new TextDecoder().decode(result.stderr),
    }).toEqual({ exitCode: 0, stderr: '' });
    expect(new TextDecoder().decode(result.stdout)).toContain(
      'BACKUP_S3_OBJECT=s3://yawp-preview-videos/demo-backups/yawp_demo-scheduled-20260817T030000Z.dump'
    );
    const commands = await readFile(harness.commandLog, 'utf8');
    expect(commands).toContain('s3api get-bucket-versioning');
    expect(commands.match(/aws s3 cp/g)?.length).toBe(2);
    expect(commands).toContain('--sse AES256');
    expect(commands).toContain(
      '--key demo-backups/yawp_demo-scheduled-20260816T030000Z.dump --version-id v1'
    );
    expect(commands).toContain(
      '--key demo-backups/yawp_demo-scheduled-20260816T030000Z.dump.sha256 --version-id v1'
    );
  });

  test('fails before upload when bucket versioning is not enabled', async () => {
    const harness = await makeHarness({ versioning: 'Suspended' });
    const result = run(harness.env);

    expect(result.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(result.stderr)).toContain(
      'bucket versioning must be enabled'
    );
    expect(await readFile(harness.commandLog, 'utf8')).not.toContain('s3 cp');
  });

  test('fails before AWS access when the local checksum does not match', async () => {
    const harness = await makeHarness();
    await writeFile(
      `${harness.backupFile}.sha256`,
      `${'0'.repeat(64)}  bad.dump\n`
    );
    const result = run(harness.env);

    expect(result.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(result.stderr)).toContain(
      'Backup checksum mismatch'
    );
    expect(await readFile(harness.commandLog, 'utf8').catch(() => '')).toBe('');
  });
});
