import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/refresh-sanitized-preview-data.sh');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function makeHarness(
  options: { sanitizerFails?: boolean; bastionStarts?: boolean } = {}
) {
  const root = await mkdtemp(
    path.join(tmpdir(), 'yawp-sanitized-preview-refresh-')
  );
  temporaryDirectories.push(root);
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'commands.log');
  const uploadedPayload = path.join(root, 'uploaded.sql');
  const key = path.join(root, 'bastion.pem');
  await mkdir(bin);
  await writeFile(key, 'test key\n', { mode: 0o600 });

  async function executable(name: string, contents: string) {
    const target = path.join(bin, name);
    await writeFile(target, `#!/usr/bin/env bash\nset -euo pipefail\n${contents}`);
    await chmod(target, 0o755);
  }

  await executable(
    'docker',
    `printf 'docker' >> "$COMMAND_LOG"; printf ' %q' "$@" >> "$COMMAND_LOG"; printf '\\n' >> "$COMMAND_LOG"
case "\${1:-}" in
  info) exit 0 ;;
  run) echo fake-container-id ;;
  port) echo '127.0.0.1:55432' ;;
  inspect) echo healthy ;;
  exec)
    if [[ " $* " == *" pg_dump "* ]]; then
      printf '%s\\n' '-- sanitized SQL' 'CREATE TABLE safe (id int);'
    else
      cat >/dev/null || true
    fi
    ;;
  rm) exit 0 ;;
esac`
  );
  await executable(
    'ssh',
    `printf 'ssh' >> "$COMMAND_LOG"; printf ' %q' "$@" >> "$COMMAND_LOG"; printf '\\n' >> "$COMMAND_LOG"
printf '%s\\n' '-- production SQL stream' 'CREATE TABLE raw_source (id int);'`
  );
  await executable(
    'aws',
    `printf 'aws' >> "$COMMAND_LOG"; printf ' %q' "$@" >> "$COMMAND_LOG"; printf '\\n' >> "$COMMAND_LOG"
if [[ " $* " == *State.Name* ]]; then echo '${options.bastionStarts ? 'stopped' : 'running'}'; fi
if [[ " $* " == *PublicIpAddress* ]]; then echo '203.0.113.42'; fi
if [[ " $* " == *" s3 cp - "* ]]; then cat > "$UPLOADED_PAYLOAD"; fi`
  );
  await executable(
    'gh',
    `printf 'gh' >> "$COMMAND_LOG"; printf ' %q' "$@" >> "$COMMAND_LOG"; printf '\\n' >> "$COMMAND_LOG"
if [[ "\${1:-}" == auth ]]; then exit 0; fi`
  );
  await executable(
    'bun',
    `printf 'bun' >> "$COMMAND_LOG"; printf ' %q' "$@" >> "$COMMAND_LOG"; printf '\\n' >> "$COMMAND_LOG"
${options.sanitizerFails ? "echo 'sanitizer failed' >&2; exit 42" : "printf '%s\\n' '{\"usersSanitized\":2,\"tablesVerified\":66,\"fingerprints\":{\"user_ids\":\"abc\"}}'"}`
  );

  return {
    root,
    bin,
    log,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      COMMAND_LOG: log,
      UPLOADED_PAYLOAD: uploadedPayload,
      YAWP_CONFIRM_SANITIZED_PREVIEW_REFRESH: 'yes',
      YAWP_PROD_BASTION_HOST: 'bastion.example.test',
      YAWP_PROD_BASTION_USER: 'ec2-user',
      YAWP_PROD_BASTION_KEY: key,
      YAWP_PROD_PG_HOST: 'prod-db.example.test',
      YAWP_PROD_PG_PORT: '5432',
      YAWP_PROD_PG_USER: 'yawp_admin',
      YAWP_PROD_PG_DB: 'yawpdb',
      YAWP_PROD_PG_PASSWORD: 'top-secret-production-password',
      PREVIEW_DB_DUMP_S3_URI:
        's3://preview-fixtures.example.test/production.dump',
      YAWP_GITHUB_REPOSITORY: 'The-Connell-School/yawp',
      YAWP_REFRESH_WORK_DIR: path.join(root, 'work'),
      YAWP_REFRESH_CONTAINER_NAME: 'yawp-refresh-test',
      YAWP_REFRESH_LOCAL_PG_PASSWORD: 'local-test-password',
      AWS_PROFILE: 'yawp',
    },
    uploadedPayload,
  };
}

function run(args: string[], env: Record<string, string | undefined>) {
  return Bun.spawnSync({
    cmd: ['bash', scriptPath, ...args],
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

describe('refresh-sanitized-preview-data.sh', () => {
  test('is wired as the documented one-command workflow', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
    const runbook = await readFile('docs/runbooks/preview.md', 'utf8');

    expect(packageJson.scripts['db:refresh-sanitized-preview-data']).toBe(
      'bash scripts/refresh-sanitized-preview-data.sh'
    );
    expect(runbook).toContain('bun run db:refresh-sanitized-preview-data');
    expect(runbook).toContain('YAWP_CONFIRM_SANITIZED_PREVIEW_REFRESH=yes');
    expect(runbook).toContain('never writes the raw production dump to disk');
  });

  test('documents safe usage without requiring configuration', () => {
    const result = run(['--help'], process.env);
    const { stdout } = output(result);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('--dry-run');
    expect(stdout).toContain('--yes');
    expect(stdout).toContain('production-sync.env');
    expect(stdout).toContain('YAWP_CONFIRM_SANITIZED_PREVIEW_REFRESH=yes');
  });

  test('fails before external commands without explicit confirmation', async () => {
    const harness = await makeHarness();
    const result = run([], {
      ...harness.env,
      YAWP_CONFIRM_SANITIZED_PREVIEW_REFRESH: undefined,
    });
    const { stderr } = output(result);

    expect(result.exitCode).not.toBe(0);
    expect(stderr).toContain('Confirmation required');
    expect(await readFile(harness.log, 'utf8').catch(() => '')).toBe('');
  });

  test('dry run shows redacted plan and performs no external commands', async () => {
    const harness = await makeHarness();
    const result = run(['--dry-run'], {
      ...harness.env,
      YAWP_CONFIRM_SANITIZED_PREVIEW_REFRESH: undefined,
    });
    const { stdout, stderr } = output(result);

    expect(result.exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain(
      'Stream production dump directly into temporary Postgres'
    );
    expect(stdout).toContain(
      'Upload scrubbed dump to s3://preview-fixtures.example.test/production.dump'
    );
    expect(stdout).not.toContain('top-secret-production-password');
    expect(await readFile(harness.log, 'utf8').catch(() => '')).toBe('');
  });

  test('streams, sanitizes, uploads, versions, and cleans up', async () => {
    const harness = await makeHarness();
    const result = run([], harness.env);
    const { stdout, stderr } = output(result);
    const commands = await readFile(harness.log, 'utf8');

    expect(result.exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('Sanitized preview snapshot refreshed.');
    expect(stdout).not.toContain('top-secret-production-password');
    expect(commands).toContain('ssh');
    expect(commands).toContain('pg_dump');
    expect(commands).toContain('aws --profile yawp s3 cp -');
    expect(commands).toContain(
      'gh variable set PREVIEW_SANITIZED_DUMP_VERSION'
    );
    expect(commands).toContain('docker rm -f yawp-refresh-test');
    expect(commands).not.toContain('tee');
    expect(await readFile(harness.uploadedPayload, 'utf8')).toContain(
      'CREATE TABLE safe'
    );
    expect(await readFile(harness.uploadedPayload, 'utf8')).not.toContain(
      'raw_source'
    );
    expect(
      await readFile(path.join(harness.root, 'work', 'sanitized.sql.gz')).catch(
        () => null
      )
    ).toBeNull();
  });

  test('sanitizer failure blocks upload and still removes temporary data', async () => {
    const harness = await makeHarness({ sanitizerFails: true });
    const result = run([], harness.env);
    const { stdout, stderr } = output(result);
    const commands = await readFile(harness.log, 'utf8');

    expect(result.exitCode).toBe(42);
    expect(stdout).not.toContain('Sanitized preview snapshot refreshed.');
    expect(stderr).toContain('sanitizer failed');
    expect(commands).toContain('docker rm -f yawp-refresh-test');
    expect(commands).not.toContain('s3 cp');
    expect(commands).not.toContain('gh variable set');
  });

  test('stops a bastion it started even when sanitization fails', async () => {
    const harness = await makeHarness({
      sanitizerFails: true,
      bastionStarts: true,
    });
    const result = run([], {
      ...harness.env,
      YAWP_PROD_BASTION_INSTANCE_ID: 'i-preview-refresh-test',
    });
    const commands = await readFile(harness.log, 'utf8');

    expect(result.exitCode).toBe(42);
    expect(commands).toContain(
      'ec2 start-instances --instance-ids i-preview-refresh-test'
    );
    expect(commands).toContain(
      'ec2 stop-instances --instance-ids i-preview-refresh-test'
    );
    expect(commands).toContain('ec2-user@203.0.113.42');
  });
});
