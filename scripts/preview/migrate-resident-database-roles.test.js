import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const script = readFileSync(
  path.join(import.meta.dir, 'migrate-resident-database-roles.sh'),
  'utf8',
);

test('fails closed when database enumeration fails', () => {
  expect(script).toContain('database_list="$($DOCKER exec');
  expect(script).toContain('Could not enumerate preview databases before role isolation');
  expect(script).not.toContain('done < <($DOCKER exec');
  expect(script).toContain('^yawp_[A-Za-z0-9_]+$');
});

test('revokes public connect again after changing each database owner', () => {
  const owner = script.indexOf('ALTER DATABASE \\"${database}\\" OWNER TO \\"${role}\\"');
  const revoke = script.indexOf(
    'REVOKE CONNECT ON DATABASE \\"${database}\\" FROM PUBLIC',
    owner,
  );
  const grant = script.indexOf(
    'GRANT CONNECT ON DATABASE \\"${database}\\" TO \\"${role}\\"',
    revoke,
  );
  expect(owner).toBeGreaterThan(-1);
  expect(revoke).toBeGreaterThan(owner);
  expect(grant).toBeGreaterThan(revoke);
});

test('does not recreate resident web containers when compose is already migrated', () => {
  expect(script).toContain('compose_database_url_changed=');
  expect(script).toContain('rewrite_compose_database_url "$compose_file" "$database" "$role" "$password_file"');
  expect(script).toContain('if [[ "$compose_database_url_changed" == "true" ]]; then');
  expect(script).toContain('else\n    echo "Resident $slug already uses isolated database role $role"');
  expect(script).toContain('active_backup=\'\'');
  expect(script).toContain('if [[ -n "$active_backup" ]]; then\n    rm -f -- "$active_backup"');
});


test('preserve-running rollout skips legacy migration without credential writes or container recreation', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, chmodSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const root = mkdtempSync(path.join(tmpdir(), 'preserve-running-'));
  try {
    const dir = path.join(root, 'previews/pr-484'); mkdirSync(dir, { recursive: true });
    const compose = 'services:\n  web: {}\n'; writeFileSync(path.join(dir, 'docker-compose.yml'), compose);
    const docker = path.join(root, 'docker'); const log = path.join(root, 'docker.log');
    writeFileSync(docker, `#!/bin/bash\nprintf '%s\\n' "$*" >> '${log}'\nif [[ "$1" == ps ]]; then echo running; elif [[ "$*" == *'SELECT datname'* ]]; then echo yawp_pr_484; elif [[ "$*" == *'SELECT 1'* ]]; then echo 1; fi\n`); chmodSync(docker, 0o755);
    const result = spawnSync('bash', [path.join(import.meta.dir, 'migrate-resident-database-roles.sh')], {
      encoding: 'utf8', env: { ...process.env, PREVIEW_ROOT: root, PREVIEW_DOCKER: docker,
        PREVIEW_POSTGRES_ADMIN_PASSWORD: 'a'.repeat(40), PREVIEW_PRESERVE_RUNNING_RESIDENTS: 'true' },
    });
    expect(result.status).toBe(0);
    expect(readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')).toBe(compose);
    expect(existsSync(path.join(dir, 'database-password'))).toBe(false);
    expect(readFileSync(log, 'utf8')).not.toMatch(/^compose\b|ALTER ROLE|createuser/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
