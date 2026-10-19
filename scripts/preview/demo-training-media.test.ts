import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderPreviewCompose } from './render-compose.mjs';

const base = {
  prNumber: '', slug: 'demo', domain: 'yawp.school', runtime: 'production',
  sourceDir: '/srv/yawp-demo/sources/demo', root: '/srv/yawp-demo',
  accessSeats: JSON.stringify([{ code: 'brave-otter-4193', organizationId: 'local-dev-org', label: 'Master' }]),
  sessionSecret: 'fixture-session-secret-at-least-32-bytes',
  accessSecret: 'fixture-access-secret-at-least-32-bytes',
  databasePassword: 'fixture-database-password-at-least-32-bytes',
};
const parse = (overrides = {}) => Bun.YAML.parse(renderPreviewCompose({ ...base, ...overrides }));

test('opt-in demo media uses its private bucket and a refreshing process provider on web alone', () => {
  for (const runtime of ['fast', 'production']) {
    const compose = parse({ runtime, demoTrainingMediaEnabled: 'true' });
    const web = compose.services.web;
    expect(web.environment.AWS_S3_BUCKET_FOR_VIDEOS).toBe('yawp-demo-training-media-422348803522');
    expect(web.environment.AWS_S3_REGION_FOR_VIDEOS).toBe('us-east-1');
    expect(web.environment.AWS_REGION).toBe('us-east-1');
    expect(web.environment.AWS_PROFILE).toBe('demo-training-media');
    expect(web.environment.AWS_CONFIG_FILE).toBe('/run/demo-training-media/config');
    expect(web.environment.AWS_EC2_METADATA_DISABLED).toBe('true');
    expect(web.volumes).toContain('/srv/yawp-demo/training-media-credentials:/run/demo-training-media:ro');
    for (const [name, service] of Object.entries<any>(compose.services)) {
      expect(service.environment?.AWS_ACCESS_KEY_ID).toBeUndefined();
      expect(service.environment?.AWS_SECRET_ACCESS_KEY).toBeUndefined();
      expect(service.environment?.AWS_SESSION_TOKEN).toBeUndefined();
      if (name !== 'web') {
        expect(service.environment?.AWS_CONFIG_FILE).toBeUndefined();
        expect(JSON.stringify(service.volumes ?? [])).not.toContain('training-media-credentials');
      }
    }
  }
});

test('media opt-in fails closed for any other target or malformed flag; flag off preserves existing config', () => {
  for (const overrides of [{ slug: 'pr-142', prNumber: '142' }, { slug: 'demo', prNumber: '142' }, { slug: 'production' }]) {
    expect(() => parse({ ...overrides, demoTrainingMediaEnabled: 'true' })).toThrow('Demo training media requires the demo target');
  }
  expect(() => parse({ demoTrainingMediaEnabled: 'yes' })).toThrow('DEMO_TRAINING_MEDIA_ENABLED must be true or false');
  const compose = parse({ demoTrainingMediaEnabled: 'false' });
  expect(compose.services.web.environment.AWS_CONFIG_FILE).toBeUndefined();
  expect(compose.services.web.environment.AWS_S3_BUCKET_FOR_VIDEOS).toBe('preview-videos');
});

test('workflow transports the opt-in and deploy installs host refresh before starting web', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/demo-environment.yml', import.meta.url), 'utf8');
  expect(workflow).toContain("DEMO_TRAINING_MEDIA_ENABLED: ${{ vars.DEMO_TRAINING_MEDIA_ENABLED || 'false' }}");
  expect(workflow).toContain('"DEMO_TRAINING_MEDIA_ENABLED=$(shell_quote "$DEMO_TRAINING_MEDIA_ENABLED")"');
  const deploy = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
  expect(deploy.indexOf('bash "$SCRIPT_DIR/install-demo-training-media.sh"')).toBeGreaterThan(-1);
  expect(deploy.indexOf('bash "$SCRIPT_DIR/install-demo-training-media.sh"')).toBeLessThan(deploy.indexOf('\nensure_shared_postgres\n'));
});

test('host refresh writes only expiring scoped credentials privately, replaces them and preserves the last file on failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'demo-media-test-'));
  const bin = join(root, 'bin');
  const directory = join(root, 'credentials');
  mkdirSync(bin);
  const fixture = { AccessKeyId: 'fixture-key', SecretAccessKey: 'fixture-secret', SessionToken: 'fixture-token', Expiration: '2099-01-01T00:00:00Z' };
  const aws = join(bin, 'aws');
  const run = () => spawnSync('node', [new URL('./refresh-demo-training-media.mjs', import.meta.url).pathname], {
    env: { PATH: `${bin}:${process.env.PATH}`, DEMO_MEDIA_CREDENTIALS_DIR: directory, TMPDIR: root }, encoding: 'utf8',
  });
  try {
    writeFileSync(aws, `#!/bin/sh\nprintf '%s' '${JSON.stringify({ Credentials: fixture })}'\n`, { mode: 0o700 });
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(JSON.stringify(JSON.parse(readFileSync(join(directory, 'credentials.json'), 'utf8'))) === JSON.stringify({ Version: 1, ...fixture })).toBe(true);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(statSync(join(directory, 'credentials.json')).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(directory, 'config'), 'utf8')).toContain('credential_process = cat /run/demo-training-media/credentials.json');
    const before = readFileSync(join(directory, 'credentials.json'), 'utf8');
    writeFileSync(aws, '#!/bin/sh\necho fixture-secret >&2\nexit 1\n', { mode: 0o700 });
    const failed = run();
    expect(failed.status).toBe(1);
    expect(failed.stderr).not.toContain('fixture-secret');
    expect(readFileSync(join(directory, 'credentials.json'), 'utf8') === before).toBe(true);
    writeFileSync(aws, '#!/bin/sh\nprintf \'{"Credentials":{}}\'\n', { mode: 0o700 });
    expect(run().status).toBe(1);
    expect(readFileSync(join(directory, 'credentials.json'), 'utf8') === before).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('installer is demo-only and aborts if the first credential refresh fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'demo-media-install-'));
  try {
    const bin = join(root, 'bin');
    const calls = join(root, 'calls');
    mkdirSync(bin);
    writeFileSync(join(bin, 'aws'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    writeFileSync(join(bin, 'sudo'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$FIXTURE_CALLS"\nif [ "$1" = tee ]; then cat >/dev/null; fi\nif [ "$1 $2" = "systemctl start" ]; then exit 7; fi\n', { mode: 0o700 });
    const run = (overrides = {}) => spawnSync('bash', [new URL('./install-demo-training-media.sh', import.meta.url).pathname], {
      encoding: 'utf8', env: { PATH: `${bin}:${process.env.PATH}`, FIXTURE_CALLS: calls, PREVIEW_SLUG: 'demo', PREVIEW_ROOT: '/srv/yawp-demo', DEMO_TRAINING_MEDIA_ENABLED: 'true', ...overrides },
    });
    expect(run({ PREVIEW_SLUG: 'pr-142' }).status).toBe(1);
    expect(run({ PR_NUMBER: '142' }).status).toBe(1);
    expect(run({ PREVIEW_ROOT: '/other' }).status).toBe(1);
    expect(run({ DEMO_TRAINING_MEDIA_ENABLED: 'false' }).status).toBe(0);
    expect(run().status).toBe(7);
    const log = readFileSync(calls, 'utf8');
    expect(log).toContain('systemctl start yawp-demo-training-media.service');
    expect(log).not.toContain('enable --now');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
