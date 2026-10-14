import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
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
    expect(ci).toContain('bun test ./scripts/deployment-contract.test.ts ./scripts/preview/demo-internal-api-config.test.ts ./scripts/preview/render-compose.test.js');
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
