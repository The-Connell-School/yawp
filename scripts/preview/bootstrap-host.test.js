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
const ingress = readFileSync(path.join(import.meta.dir, 'ingress-server.mjs'), 'utf8');
const deploy = readFileSync(path.join(import.meta.dir, 'deploy.sh'), 'utf8');

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

  test('records authorized activity directly without a proxy access log', () => {
    expect(script).not.toContain('PREVIEW_ACCESS_LOG=');
    expect(script).not.toContain('--accesslog');
    expect(ingress).toContain("upstreamResponse.headers['x-yawp-preview-authorized']");
    expect(ingress).toContain('recordAccess(pr)');
  });

  test('cuts over to the custom ingress with TLS canary and rollback', () => {
    expect(script).toContain('yawp-preview-ingress.service');
    expect(script).toContain('AmbientCapabilities=CAP_NET_BIND_SERVICE');
    expect(script).toContain('PREVIEW_HTTP_PORT=19080');
    expect(script).toContain('PREVIEW_HTTPS_PORT=19443');
    expect(script).toContain('rollback_ingress');
    expect(script).toContain('systemctl disable --now yawp-preview-ingress.service');
    expect(script).toContain('previous-ingress.$$.service');
    expect(script).toContain('cp -p -- "$previous_ingress_unit" "$ingress_unit"');
    expect(script).toContain('^yawp-pr-([1-9][0-9]*)-web-1$');
    expect(script).toContain('for public_hostname in "${running_hostnames[@]}"');
    expect(script).toContain('"https://$public_hostname/api/healthcheck"');
    expect(script).toContain('docker rm "$traefik_container"');
    expect(script).not.toContain('image: traefik');
    expect(script).not.toContain('docker-compose.yml" up -d');
  });

  test('migrates resident certificates and installs automatic renewal', () => {
    expect(script).toContain('node "$certificate_manager" --import-traefik');
    expect(script).toContain('yawp-preview-certificate-renewal.timer');
    expect(script).toContain('$ROOT/ingress/current/certificate-manager.mjs --resident');
    expect(previewWorkflow).toContain('PREVIEW_ACME_EMAIL');
    expect(deploy).toContain('node "$SCRIPT_DIR/certificate-manager.mjs" "$HOSTNAME"');
    expect(deploy.indexOf('certificate-manager.mjs" "$HOSTNAME"')).toBeLessThan(
      deploy.indexOf('for attempt in $(seq 1 90)')
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
