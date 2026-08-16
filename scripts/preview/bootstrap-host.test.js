import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const script = readFileSync(path.join(import.meta.dir, 'bootstrap-host.sh'), 'utf8');
const workflow = readFileSync(
  path.join(import.meta.dir, '../../.github/workflows/preview-host-bootstrap.yml'),
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
});
