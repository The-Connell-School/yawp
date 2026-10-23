import { describe, expect, test } from 'bun:test';
import {
  auditInternalApiKeys,
  formatDemoInternalApiKeyAudit,
} from './print-demo-internal-api-key-audit.mjs';

const testSecret = 'fixture-only-hmac-material-000000000000000';

describe('print-demo-internal-api-key-audit', () => {
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
});
