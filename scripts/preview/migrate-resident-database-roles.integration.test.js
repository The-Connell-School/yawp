import { afterAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const enabled = process.env.PREVIEW_DATABASE_ROLE_INTEGRATION === '1';
const integrationTest = enabled ? test : test.skip;
const resources = [];

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

afterAll(() => {
  for (const resource of resources.splice(0)) {
    if (resource.container) run('docker', ['rm', '-f', resource.container]);
    if (resource.root) rmSync(resource.root, { recursive: true, force: true });
  }
});

integrationTest('migrates a sleeping resident and denies its role access to another preview database', () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const container = `yawp-role-integration-${suffix}`;
  const root = mkdtempSync(path.join(tmpdir(), 'yawp-role-integration-'));
  resources.push({ container, root });
  const previewDir = path.join(root, 'previews', 'pr-241');
  const runningPreviewDir = path.join(root, 'previews', 'pr-240');
  const failingPreviewDir = path.join(root, 'previews', 'pr-242');
  mkdirSync(previewDir, { recursive: true });
  mkdirSync(runningPreviewDir, { recursive: true });
  mkdirSync(failingPreviewDir, { recursive: true });
  const oldAdmin = 'old-preview-admin-password-00000001';
  const newAdmin = 'new-preview-admin-password-00000001';
  writeFileSync(path.join(previewDir, 'docker-compose.yml'), `services:
  web:
    image: busybox:1.36
    command: ["sleep", "3600"]
    environment:
      DATABASE_URL: "postgresql://postgres:${oldAdmin}@preview-postgres:5432/yawp_pr_241"
`);
  writeFileSync(path.join(runningPreviewDir, 'docker-compose.yml'), `services:
  web:
    image: busybox:1.36
    command: ["sleep", "3600"]
    environment:
      DATABASE_URL: "postgresql://postgres:${oldAdmin}@preview-postgres:5432/yawp_pr_240"
    healthcheck:
      test: ["CMD", "true"]
      interval: 1s
      timeout: 1s
      retries: 10
`);
  const failingCompose = `services:
  web:
    image: busybox:1.36
    command: ["sleep", "3600"]
`;
  writeFileSync(path.join(failingPreviewDir, 'docker-compose.yml'), failingCompose);

  const started = run('docker', [
    'run', '-d', '--name', container,
    '-e', `POSTGRES_PASSWORD=${oldAdmin}`,
    'postgres:16',
  ]);
  expect(started.status).toBe(0);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (run('docker', ['exec', container, 'pg_isready', '-U', 'postgres']).status === 0) {
      ready = true;
      break;
    }
    Bun.sleepSync(250);
  }
  expect(ready).toBe(true);
  expect(run('docker', ['exec', container, 'createdb', '-U', 'postgres', 'yawp_pr_241']).status).toBe(0);
  expect(run('docker', ['exec', container, 'createdb', '-U', 'postgres', 'yawp_pr_240']).status).toBe(0);
  expect(run('docker', ['exec', container, 'createdb', '-U', 'postgres', 'yawp_pr_242']).status).toBe(0);
  expect(run('docker', ['exec', container, 'createdb', '-U', 'postgres', 'yawp_template']).status).toBe(0);
  expect(run('docker', [
    'exec', container, 'psql', '-U', 'postgres', '-d', 'yawp_pr_241', '-c',
    'CREATE TABLE retained_state (id integer primary key); INSERT INTO retained_state VALUES (1);',
  ]).status).toBe(0);

  const runningCompose = path.join(runningPreviewDir, 'docker-compose.yml');
  expect(run('docker', [
    'compose', '-p', 'yawp-pr-240', '-f', runningCompose, 'up', '-d', 'web',
  ]).status).toBe(0);
  const migrationOptions = {
    env: {
      ...process.env,
      PREVIEW_ROOT: root,
      PREVIEW_POSTGRES_CONTAINER: container,
      PREVIEW_POSTGRES_ADMIN_PASSWORD: newAdmin,
      PREVIEW_MIGRATION_HEALTH_ATTEMPTS: '40',
      PREVIEW_MIGRATION_HEALTH_INTERVAL_SECONDS: '1',
    },
    timeout: 120_000,
  };
  const firstAttempt = run(
    'bash',
    [path.join(import.meta.dir, 'migrate-resident-database-roles.sh')],
    migrationOptions,
  );
  expect(firstAttempt.status).not.toBe(0);
  expect(readFileSync(path.join(failingPreviewDir, 'docker-compose.yml'), 'utf8')).toBe(failingCompose);
  const postgresIp = run('docker', [
    'inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', container,
  ]).stdout.trim();
  const oldAdminStillWorks = run('docker', [
    'run', '--rm', '-e', `PGPASSWORD=${oldAdmin}`, 'postgres:16',
    'psql', '-h', postgresIp, '-U', 'postgres', '-d', 'postgres', '-Atc', 'SELECT 1',
  ]);
  expect(oldAdminStillWorks.status).toBe(0);
  const partialPassword = readFileSync(
    path.join(previewDir, 'database-password'),
    'utf8',
  ).trim();
  const partialCross = run('docker', [
    'exec', '-e', `PGPASSWORD=${partialPassword}`, container,
    'psql', '-h', '127.0.0.1', '-U', 'yawp_pr_241_app', '-d', 'yawp_pr_242', '-Atc', 'SELECT 1',
  ]);
  expect(partialCross.status).not.toBe(0);
  const partialTemplate = run('docker', [
    'exec', '-e', `PGPASSWORD=${partialPassword}`, container,
    'psql', '-h', '127.0.0.1', '-U', 'yawp_pr_241_app', '-d', 'yawp_template', '-Atc', 'SELECT 1',
  ]);
  expect(partialTemplate.status).not.toBe(0);

  writeFileSync(path.join(failingPreviewDir, 'docker-compose.yml'), `services:
  web:
    image: busybox:1.36
    command: ["sleep", "3600"]
    environment:
      DATABASE_URL: "postgresql://postgres:${oldAdmin}@preview-postgres:5432/yawp_pr_242"
`);
  const migrated = run(
    'bash',
    [path.join(import.meta.dir, 'migrate-resident-database-roles.sh')],
    migrationOptions,
  );
  expect(migrated.status, migrated.stderr).toBe(0);
  const password = readFileSync(path.join(previewDir, 'database-password'), 'utf8').trim();
  const compose = readFileSync(path.join(previewDir, 'docker-compose.yml'), 'utf8');
  expect(compose).toContain(`postgresql://yawp_pr_241_app:${password}@preview-postgres:5432/yawp_pr_241`);
  expect(compose).not.toContain('postgresql://postgres:');

  const own = run('docker', [
    'exec', '-e', `PGPASSWORD=${password}`, container,
    'psql', '-h', '127.0.0.1', '-U', 'yawp_pr_241_app', '-d', 'yawp_pr_241', '-Atc',
    'SELECT count(*) FROM retained_state',
  ]);
  expect(own.status).toBe(0);
  expect(own.stdout.trim()).toBe('1');
  const cross = run('docker', [
    'exec', '-e', `PGPASSWORD=${password}`, container,
    'psql', '-h', '127.0.0.1', '-U', 'yawp_pr_241_app', '-d', 'yawp_pr_242', '-Atc', 'SELECT 1',
  ]);
  expect(cross.status).not.toBe(0);
  const template = run('docker', [
    'exec', '-e', `PGPASSWORD=${password}`, container,
    'psql', '-h', '127.0.0.1', '-U', 'yawp_pr_241_app', '-d', 'yawp_template', '-Atc', 'SELECT 1',
  ]);
  expect(template.status).not.toBe(0);

  const roleFlags = run('docker', [
    'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc',
    "SELECT rolsuper::int || ':' || rolcreatedb::int || ':' || rolcreaterole::int || ':' || rolbypassrls::int FROM pg_roles WHERE rolname='yawp_pr_241_app'",
  ]);
  expect(roleFlags.stdout.trim()).toBe('0:0:0:0');
  const containerId = run('docker', [
    'compose', '-p', 'yawp-pr-241', '-f', path.join(previewDir, 'docker-compose.yml'),
    'ps', '-a', '-q', 'web',
  ]).stdout.trim();
  expect(containerId.length).toBeGreaterThan(0);
  expect(run('docker', ['inspect', '--format', '{{.State.Running}}', containerId]).stdout.trim()).toBe('false');
  const runningContainerId = run('docker', [
    'compose', '-p', 'yawp-pr-240', '-f', runningCompose, 'ps', '-q', 'web',
  ]).stdout.trim();
  expect(run('docker', ['inspect', '--format', '{{.State.Health.Status}}', runningContainerId]).stdout.trim()).toBe('healthy');

  const newAdminLogin = run('docker', [
    'run', '--rm', '-e', `PGPASSWORD=${newAdmin}`, 'postgres:16',
    'psql', '-h', postgresIp, '-U', 'postgres', '-d', 'postgres', '-Atc', 'SELECT 1',
  ]);
  expect(newAdminLogin.status).toBe(0);
  const oldAdminLogin = run('docker', [
    'run', '--rm', '-e', `PGPASSWORD=${oldAdmin}`, 'postgres:16',
    'psql', '-h', postgresIp, '-U', 'postgres', '-d', 'postgres', '-Atc', 'SELECT 1',
  ]);
  expect(oldAdminLogin.status).not.toBe(0);
});
