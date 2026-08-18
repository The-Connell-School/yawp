import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/guard-demo-backup-iam.sh');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function makeHarness({ decision = 'explicitDeny' } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'yawp-demo-iam-'));
  temporaryDirectories.push(root);
  const bin = path.join(root, 'bin');
  const commandLog = path.join(root, 'commands.log');
  await mkdir(bin);
  await writeFile(
    path.join(bin, 'aws'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'aws' >> "$COMMAND_LOG"
printf ' %q' "$@" >> "$COMMAND_LOG"
printf '\n' >> "$COMMAND_LOG"
if [[ " $* " == *" ec2 describe-instances "* ]]; then
  if [[ " $* " == *" --filters "* ]]; then
    printf 'i-abc123\n'
  else
    printf 'arn:aws:iam::123456789012:instance-profile/yawp-demo\n'
  fi
elif [[ " $* " == *" iam get-instance-profile "* ]]; then
  printf 'yawp-demo-role\n'
elif [[ " $* " == *" iam get-role "* ]]; then
  printf 'arn:aws:iam::123456789012:role/yawp-demo-role\n'
elif [[ " $* " == *" iam simulate-principal-policy "* ]]; then
  printf '${decision}\t${decision}\n'
fi
`
  );
  await chmod(path.join(bin, 'aws'), 0o755);

  return {
    commandLog,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      COMMAND_LOG: commandLog,
      DEMO_HOST: '52.2.48.34',
      BACKUP_S3_URI: 's3://yawp-preview-videos/demo-backups',
      AWS_REGION: 'us-east-1',
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

describe('demo backup IAM guard', () => {
  test('applies and proves an explicit deny for object and version deletion', async () => {
    const harness = await makeHarness();
    const result = run(harness.env);

    expect(result.exitCode).toBe(0);
    const commands = await readFile(harness.commandLog, 'utf8');
    expect(commands).toContain('iam put-role-policy');
    expect(commands).toContain('yawp-demo-backup-deny-delete');
    expect(commands).toContain('s3:DeleteObject');
    expect(commands).toContain('s3:DeleteObjectVersion');
    expect(commands).toContain('iam simulate-principal-policy');
    expect(new TextDecoder().decode(result.stdout)).toContain(
      'DEMO_BACKUP_DELETE_DECISION=explicitDeny'
    );
  });

  test('fails unless AWS proves both delete actions are explicitly denied', async () => {
    const harness = await makeHarness({ decision: 'allowed' });
    const result = run(harness.env);

    expect(result.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(result.stderr)).toContain(
      'does not explicitly deny backup deletion'
    );
  });
});
