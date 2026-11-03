import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { DEMO_INTERNAL_API_SCOPE_SET } from './demo-internal-api-config.mjs';
import {
  auditInternalApiKeys,
  formatDemoInternalApiKeyAudit,
} from './demo-internal-api-key-audit.mjs';

const testSecret = 'fixture-only-hmac-material-000000000000000';
const previewDir = import.meta.dir;

describe('demo-internal-api-key-audit', () => {
  test('reports count, ids, scopes, and field names without secret values', () => {
    const raw = JSON.stringify([
      {
        id: 'demo-internal',
        secret: testSecret,
        scopes: ['management:read', 'management:write'],
      },
    ]);
    const formatted = formatDemoInternalApiKeyAudit(auditInternalApiKeys(raw));
    expect(formatted).toBe(
      'count=1\nentry\tdemo-internal\t["management:read","management:write"]\tid,scopes,secret'
    );
    expect(formatted.includes(testSecret)).toBe(false);
  });

  test('returns an empty audit when the env var is unset', () => {
    expect(formatDemoInternalApiKeyAudit(auditInternalApiKeys(''))).toBe('count=0');
  });

  test('prints only PARSE_ERROR and the error class on invalid JSON', () => {
    const formatted = formatDemoInternalApiKeyAudit(auditInternalApiKeys('{'));
    expect(formatted).toMatch(/^PARSE_ERROR SyntaxError$/);
    expect(formatted.includes('{')).toBe(false);
  });

  test('sanitizes malformed entries without leaking secret-shaped values', () => {
    const raw = JSON.stringify([
      null,
      { id: { nested: true }, scopes: [['management:write']], secret: testSecret, token: 'x' },
      {
        id: 'bad\nid',
        scopes: [testSecret, 'management:write'],
        secret: testSecret,
        'bad\tfield': true,
      },
    ]);
    const formatted = formatDemoInternalApiKeyAudit(auditInternalApiKeys(raw));
    expect(formatted).toBe(
      [
        'count=3',
        'entry\t<invalid>\t["<invalid>"]\t<invalid>',
        'entry\t<invalid>\t["<invalid>"]\tid,scopes,secret,<other>',
        'entry\t<invalid>\t["<invalid>","management:write"]\tid,scopes,secret,<other>',
      ].join('\n')
    );
    expect(formatted.includes(testSecret)).toBe(false);
  });

  test('returns PARSE_ERROR for non-array JSON without echoing the payload', () => {
    const formatted = formatDemoInternalApiKeyAudit(
      auditInternalApiKeys(JSON.stringify({ id: 'demo-internal', secret: testSecret }))
    );
    expect(formatted).toBe('PARSE_ERROR TypeError');
    expect(formatted.includes(testSecret)).toBe(false);
  });

  test('DEMO_INTERNAL_API_SCOPE_SET matches INTERNAL_API_SCOPES in platform auth', () => {
    const platformSource = readFileSync(
      join(previewDir, '../../services/web-app/app/utils/internal-platform-auth.server.ts'),
      'utf8'
    );
    const block = platformSource.match(
      /export const INTERNAL_API_SCOPES = \[([\s\S]*?)\] as const/
    )?.[1];
    expect(block).toBeTruthy();
    const platformScopes = [...block!.matchAll(/'([^']+)'/g)]
      .map((match) => match[1])
      .sort();
    expect([...DEMO_INTERNAL_API_SCOPE_SET].sort()).toEqual(platformScopes);
  });

  test('runs a bundled CLI through bun run - from an empty directory', () => {
    const raw = JSON.stringify([
      {
        id: 'demo-internal',
        secret: testSecret,
        scopes: ['management:write'],
      },
    ]);
    const bundleDir = mkdtempSync(join(tmpdir(), 'yawp-audit-bundle-'));
    const bundlePath = join(bundleDir, 'audit.bundle.mjs');
    const build = spawnSync(
      'bun',
      [
        'build',
        join(previewDir, 'print-demo-internal-api-key-audit.cli.mjs'),
        '--target=bun',
        '--format=esm',
        `--outfile=${bundlePath}`,
      ],
      { encoding: 'utf8' }
    );
    expect(build.status).toBe(0);
    const emptyDir = mkdtempSync(join(tmpdir(), 'yawp-audit-empty-'));
    const result = spawnSync('bun', ['run', '-'], {
      cwd: emptyDir,
      input: readFileSync(bundlePath, 'utf8'),
      env: {
        ...process.env,
        YAWP_INTERNAL_API_KEYS: raw,
      },
      encoding: 'utf8',
    });
    rmSync(bundleDir, { recursive: true, force: true });
    rmSync(emptyDir, { recursive: true, force: true });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(
      'count=1\nentry\tdemo-internal\t["management:write"]\tid,scopes,secret'
    );
    expect(result.stdout.includes(testSecret)).toBe(false);
  });

  test('runs through bun run - stdin the same way the demo container does', () => {
    const raw = JSON.stringify([
      {
        id: 'demo-internal',
        secret: testSecret,
        scopes: ['management:write'],
      },
    ]);
    const cli = readFileSync(
      join(previewDir, 'print-demo-internal-api-key-audit.cli.mjs'),
      'utf8'
    );
    const result = spawnSync('bun', ['run', '-'], {
      cwd: previewDir,
      input: cli,
      env: {
        ...process.env,
        YAWP_INTERNAL_API_KEYS: raw,
      },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(
      'count=1\nentry\tdemo-internal\t["management:write"]\tid,scopes,secret'
    );
    expect(result.stdout.includes(testSecret)).toBe(false);
    expect(result.stderr).toBe('');
  });
});
