import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const script = readFileSync(path.join(import.meta.dir, 'bootstrap-host.sh'), 'utf8');
const workflow = readFileSync(
  path.join(import.meta.dir, '../../.github/workflows/preview-host-bootstrap.yml'),
  'utf8',
);
const previewWorkflow = readFileSync(
  path.join(import.meta.dir, '../../.github/workflows/preview-environments.yml'),
  'utf8',
);

describe('bootstrap-host.sh', () => {
  test('does not recursively chown the lifecycle-managed preview root', () => {
    expect(script).not.toContain('chown -R "$USER":"$USER" "$ROOT"');
    expect(script).toContain('"$ROOT/previews"');
    expect(script).toContain('"$ROOT/sources"');
    expect(script).toContain('"$ROOT/wake/access"');
  });

  test('plumbs the sleep kill switch into the wake service', () => {
    expect(script).toContain('Environment=PREVIEW_SLEEP_ENABLED=$SLEEP_ENABLED');
    expect(workflow).toContain("PREVIEW_SLEEP_ENABLED: ${{ vars.PREVIEW_SLEEP_ENABLED || 'true' }}");
    expect(workflow).toContain('PREVIEW_SLEEP_ENABLED=$(shell_quote "$PREVIEW_SLEEP_ENABLED")');
  });

  test('plumbs the deploy marker TTL into the wake service', () => {
    expect(script).toContain(
      'Environment=PREVIEW_INFLIGHT_TTL_SECONDS=$INFLIGHT_TTL_SECONDS'
    );
    expect(workflow).toContain(
      "PREVIEW_INFLIGHT_TTL_SECONDS: ${{ vars.PREVIEW_INFLIGHT_TTL_SECONDS || '3600' }}"
    );
    expect(workflow).toContain(
      'PREVIEW_INFLIGHT_TTL_SECONDS=$(shell_quote "$PREVIEW_INFLIGHT_TTL_SECONDS")'
    );
  });

  test('logs only the non-secret authorization marker needed for activity leases', () => {
    expect(script).toContain('--accesslog.fields.defaultmode=drop');
    expect(script).toContain('--accesslog.fields.names.RequestHost=keep');
    expect(script).toContain('--accesslog.fields.names.RequestMethod=keep');
    expect(script).toContain('--accesslog.fields.names.DownstreamStatus=keep');
    expect(script).toContain('--accesslog.fields.names.OriginStatus=keep');
    expect(script).toContain('--accesslog.fields.names.RequestPath=drop');
    expect(script).toContain('--accesslog.fields.headers.defaultmode=drop');
    expect(script).toContain(
      '--accesslog.fields.headers.names.X-Yawp-Preview-Authorized=keep'
    );
  });

  test('allows transactional wake rollback to finish before systemd force-kills the unit', () => {
    expect(script).toContain('KillMode=control-group');
    expect(script).toContain('TimeoutStopSec=1200');
  });

  test('fails closed when the host lock command is unavailable', () => {
    expect(script).toContain('command -v flock >/dev/null 2>&1 ||');
    expect(script).toContain('flock is required for preview host mutation locking');
  });

  test('waits for shared Postgres before resident database migration', () => {
    const readiness = script.indexOf(
      'docker exec preview-postgres pg_isready -U postgres -d postgres'
    );
    const migration = script.indexOf('bash "$database_role_migration"');
    expect(readiness).toBeGreaterThan(-1);
    expect(migration).toBeGreaterThan(readiness);
    expect(script).toContain(
      'Shared preview Postgres did not become ready before resident migration'
    );
  });

  test('runs manual shared-host cleanup only from reviewed default-branch code', () => {
    expect(previewWorkflow).toContain(
      "github.event_name == 'workflow_dispatch' && github.ref == format('refs/heads/{0}', github.event.repository.default_branch)"
    );
    expect(previewWorkflow).toContain('environment: preview-host');
    expect(previewWorkflow).toContain('ref: ${{ github.sha }}');
  });
});
