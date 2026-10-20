import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPreviewCompose } from './render-compose.mjs';
import { spawnSync } from 'node:child_process';

const testSecret = 'fixture-only-hmac-material-000000000000000';
const keys = JSON.stringify([{ id: 'demo-internal', secret: testSecret, scopes: ['management:read', 'management:write'] }]);
const base = {
  prNumber: '', slug: 'demo', domain: 'yawp.school', runtime: 'production',
  sourceDir: '/srv/yawp-demo/sources/demo',
  accessSeats: JSON.stringify([{ code: 'brave-otter-4193', organizationId: 'local-dev-org', label: 'Master' }]),
  sessionSecret: 'fixture-only-session-secret-0000000000',
  accessSecret: 'fixture-only-access-secret-0000000000',
  databasePassword: 'fixture-only-database-password-000000',
};
type Compose = { services: Record<string, { environment: Record<string, string | undefined> }> };
const parsed = (internalApiKeys: string | undefined, overrides = {}) =>
  Bun.YAML.parse(renderPreviewCompose({ ...base, internalApiKeys, ...overrides })) as Compose;

describe('demo signed management configuration', () => {
  test('forwards scoped HMAC JSON to the demo web app alone in both runtimes', () => {
    for (const runtime of ['fast', 'production']) {
      const compose = parsed(keys, { runtime });
      // Boolean comparisons prevent credential-shaped fixtures appearing in diffs.
      expect(compose.services.web.environment.YAWP_INTERNAL_API_KEYS === keys).toBe(true);
      for (const [name, service] of Object.entries(compose.services)) {
        if (name !== 'web') expect(service.environment?.YAWP_INTERNAL_API_KEYS === undefined).toBe(true);
      }
    }
  });

  test('omits missing configuration so signed writes remain unavailable', () => {
    for (const value of [undefined, '', '  ']) {
      expect(parsed(value).services.web.environment.YAWP_INTERNAL_API_KEYS === undefined).toBe(true);
    }
  });

  test('refuses to put demo signing credentials into another environment', () => {
    for (const overrides of [{ prNumber: '142', slug: 'demo' }, { slug: 'production' }, { prNumber: '142', slug: 'pr-142' }]) {
      let message = '';
      try { parsed(keys, overrides); } catch (error) { message = (error as Error).message; }
      expect(message === 'Demo Internal API keys require the demo target').toBe(true);
    }
  });

  test('rejects malformed or insufficiently scoped configurations without exposing values', () => {
    const entry = { id: 'demo-internal', secret: testSecret, scopes: ['management:write'] };
    const invalid = [testSecret, '{}', '[]', JSON.stringify([{}]), JSON.stringify([{ ...entry, secret: 'short' }]),
      JSON.stringify([{ ...entry, scopes: ['management:read'] }]), JSON.stringify([{ ...entry, scopes: ['unknown'] }]),
      JSON.stringify([{ ...entry, extra: true }]), JSON.stringify([entry, entry])];
    for (const value of invalid) {
      let message = '';
      try { parsed(value); } catch (error) { message = (error as Error).message; }
      expect(message === 'DEMO_INTERNAL_API_KEYS must contain valid, uniquely identified scoped keys including management:write').toBe(true);
      expect(message.includes(testSecret)).toBe(false);
    }
  });

  test('escapes Compose interpolation while preserving arbitrary supported key characters', () => {
    const config = JSON.stringify([{ id: 'demo-internal', secret: `${testSecret}$VALUE'"\\`, scopes: ['management:write'] }]);
    const value = parsed(config).services.web.environment.YAWP_INTERNAL_API_KEYS;
    expect(value?.replaceAll('$$', '$') === config).toBe(true);
    expect(value?.includes('$VALUE') && value.includes('$$VALUE')).toBe(true);
  });

  test('demo workflow forwards a secret reference with a preflight guard and previews have no path', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/demo-environment.yml', import.meta.url), 'utf8');
    expect(workflow).toContain('DEMO_INTERNAL_API_KEYS: ${{ secrets.DEMO_INTERNAL_API_KEYS }}');
    expect(workflow).toContain('"DEMO_INTERNAL_API_KEYS=$(shell_quote "$DEMO_INTERNAL_API_KEYS")"');
    expect(workflow).toContain('node demo-control/scripts/preview/demo-internal-api-config.mjs');
    expect(workflow.indexOf('node demo-control/scripts/preview/demo-internal-api-config.mjs') < workflow.indexOf('- name: Prepare SSH')).toBe(true);
    expect(workflow).not.toMatch(/echo[^\n]*\$DEMO_INTERNAL_API_KEYS/);
    const previewWorkflow = readFileSync(new URL('../../.github/workflows/preview-environments.yml', import.meta.url), 'utf8');
    expect(previewWorkflow).not.toContain('DEMO_INTERNAL_API_KEYS');
    expect(previewWorkflow).not.toContain('YAWP_INTERNAL_API_KEYS');
    const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(ci).toContain(
      'bun test ./scripts/deployment-contract.test.ts ./scripts/preview/demo-ecr-deploy.test.ts ./scripts/preview/demo-internal-api-config.test.ts ./scripts/preview/render-compose.test.js'
    );
  });

  test('workflow preflight refuses missing/malformed keys and never prints configuration', () => {
    for (const value of ['', testSecret, keys]) {
      const result = spawnSync('node', [new URL('./demo-internal-api-config.mjs', import.meta.url).pathname], {
        env: { PATH: process.env.PATH, DEMO_INTERNAL_API_KEYS: value }, encoding: 'utf8',
      });
      expect(result.status).toBe(value === keys ? 0 : 1);
      expect(result.stdout === '').toBe(true);
      expect(result.stderr.includes(testSecret)).toBe(false);
    }
  });

  test('failure-log masking removes JSON key material including whitespace', () => {
    const script = readFileSync(new URL('./run-host-deploy-detached.sh', import.meta.url), 'utf8');
    const mask = script.slice(script.indexOf('mask_deploy_log() {'), script.indexOf('\nemit_failure_log_tail()'));
    const input = `DEMO_INTERNAL_API_KEYS=${JSON.stringify(JSON.parse(keys), null, 0).replaceAll(',', ', ')}\nYAWP_INTERNAL_API_KEYS=${keys}\n`;
    const result = spawnSync('bash', ['-c', `${mask}\nmask_deploy_log`], { input, encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout === 'DEMO_INTERNAL_API_KEYS=[REDACTED]\nYAWP_INTERNAL_API_KEYS=[REDACTED]\n').toBe(true);
    expect(result.stdout.includes(testSecret)).toBe(false);
  });
});

// Run the actual detached runner and real bash/flock/setsid locally. Only SSH/SCP
// are replaced: SSH executes exactly the command OpenSSH would pass to the host.
// Fixtures never reach a network, and boolean assertions keep their bytes out of
// test failure output. Each run owns its paths, including the local log copy.
function runDetachedTransport(value: string, targetExit = 0) {
  const root = mkdtempSync(join(tmpdir(), 'demo-detached-transport-'));
  const bin = join(root, 'bin');
  const source = join(root, 'remote source');
  mkdirSync(bin);
  mkdirSync(source);
  writeFileSync(join(bin, 'ssh'), `#!/usr/bin/env bash
set -euo pipefail
while [[ "$1" == -* ]]; do
  case "$1" in
    -i|-o) shift 2 ;;
    *) exit 90 ;;
  esac
done
shift # SSH target
exec bash -c "$*"
`, { mode: 0o700 });
  writeFileSync(join(bin, 'scp'), `#!/usr/bin/env bash
set -euo pipefail
while [[ "$1" == -* ]]; do
  case "$1" in
    -i) shift 2 ;;
    -q) shift ;;
    *) exit 90 ;;
  esac
done
cp -- "\${1#*:}" "$2"
`, { mode: 0o700 });
  writeFileSync(join(source, 'target.sh'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s' "$DEMO_INTERNAL_API_KEYS" > received-keys
printf '%s' "$PREVIEW_MANAGEMENT_SERVICE_KEY" > received-scalar
printf 'executed' > executed
exit ${targetExit}
`);
  const runner = new URL('./run-host-deploy-detached.sh', import.meta.url).pathname;
  try {
    // Same shell_quote, cd and assignment construction as Demo environment.
    const result = spawnSync('bash', ['-c', `
set -euo pipefail
shell_quote() { printf '%q' "$1"; }
REMOTE_COMMAND="cd $(shell_quote "$TRANSPORT_SOURCE") && DEMO_INTERNAL_API_KEYS=$(shell_quote "$DEMO_INTERNAL_API_KEYS") PREVIEW_MANAGEMENT_SERVICE_KEY=$(shell_quote "$PREVIEW_MANAGEMENT_SERVICE_KEY") bash target.sh"
export REMOTE_COMMAND
exec bash "$TRANSPORT_RUNNER"
`], {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        SSH_IDENTITY: join(root, 'unused-identity'), SSH_TARGET: 'local-fixture',
        LOCK_FILE: join(root, 'host lock'), DEPLOY_LOG: join(root, 'deploy log'),
        LOCAL_LOG_COPY: join(root, 'local log'),
        DEPLOY_TIMEOUT_SECONDS: '2', DEPLOY_POLL_SECONDS: '0.05',
        TRANSPORT_SOURCE: source, TRANSPORT_RUNNER: runner,
        DEMO_INTERNAL_API_KEYS: value,
        PREVIEW_MANAGEMENT_SERVICE_KEY: 'fixture-only-existing-scalar',
      },
      encoding: 'utf8', timeout: 5000,
    });
    return {
      status: result.status,
      executed: existsSync(join(source, 'executed')),
      exactKeys: existsSync(join(source, 'received-keys')) && readFileSync(join(source, 'received-keys'), 'utf8') === value,
      exactScalar: existsSync(join(source, 'received-scalar')) && readFileSync(join(source, 'received-scalar'), 'utf8') === 'fixture-only-existing-scalar',
      copiedLog: existsSync(join(root, 'local log')),
      leaked: result.stdout.includes(testSecret) || result.stderr.includes(testSecret),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('demo HMAC bytes through the actual detached SSH runner', () => {
  const specialKeys = [{ id: 'demo-internal', secret: `${testSecret}$VALUE'"\\$(printf unintended);\u0060printf unintended\u0060`, scopes: ['management:write'] }];
  const cases = [
    ['existing scalar control', 'fixture-only-scalar'],
    ['compact JSON', keys],
    ['spaced JSON', keys.replaceAll(',', ', ')],
    ['pretty-printed JSON', JSON.stringify(JSON.parse(keys), null, 2)],
    ['compact JSON with dollar, quotes, backslash and shell metacharacters', JSON.stringify(specialKeys)],
    ['pretty-printed JSON with dollar, quotes, backslash and shell metacharacters', JSON.stringify(specialKeys, null, 2)],
  ];
  for (const [name, value] of cases) {
    test(`executes the target and preserves exact bytes for ${name}`, () => {
      const result = runDetachedTransport(value);
      expect(result.status).toBe(0);
      expect(result.executed).toBe(true);
      expect(result.exactKeys).toBe(true);
      expect(result.exactScalar).toBe(true);
      expect(result.copiedLog).toBe(true);
      expect(result.leaked).toBe(false);
    }, 8000);
  }

  test('propagates the target failure after delivering exact JSON bytes', () => {
    const result = runDetachedTransport(JSON.stringify(specialKeys, null, 2), 17);
    expect(result.status).toBe(17);
    expect(result.executed).toBe(true);
    expect(result.exactKeys).toBe(true);
    expect(result.exactScalar).toBe(true);
    expect(result.copiedLog).toBe(true);
    expect(result.leaked).toBe(false);
  }, 8000);
});
