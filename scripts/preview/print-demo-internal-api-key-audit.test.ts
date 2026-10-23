import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
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
        'entry\t<invalid>\t["<invalid>"]\tid,scopes,secret,token',
        'entry\t<invalid>\t["<invalid>","management:write"]\t<invalid>,id,scopes,secret',
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
