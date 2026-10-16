import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as auditList from '~/utils/internal-platform-api-audit-list.server';

const managementKey = 's'.repeat(43);
const secret = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
const keyConfig = JSON.stringify([
  { id: 'auditor', secret, scopes: ['audit:read'] },
  { id: 'flags', secret: `${secret}-flags`, scopes: ['flags:write'] },
]);

const listPlatformApiAudit = mock(async () => ({
  events: [
    {
      id: 'evt-1',
      keyId: 'writer',
      actor: 'ops@yawp.school',
      method: 'POST',
      endpoint: '/api/internal/v1/feature-flags/demo',
      result: 'authorized',
      timestamp: '2026-10-02T12:00:00.000Z',
    },
  ],
  nextCursor: null,
}));

mock.module('~/utils/internal-platform-api-audit-list.server', () => ({
  ...auditList,
  listPlatformApiAudit,
}));

describe('GET /api/internal/v1/audit', () => {
  const saved = {
    keys: process.env.YAWP_INTERNAL_API_KEYS,
    management: process.env.YAWP_MANAGEMENT_SERVICE_KEY,
    nonceStore: process.env.INTERNAL_API_NONCE_STORE,
    legacy: process.env.LEGACY_INTERNAL_KEY_ALLOWED,
  };

  beforeEach(() => {
    process.env.YAWP_INTERNAL_API_KEYS = keyConfig;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = managementKey;
    process.env.INTERNAL_API_NONCE_STORE = 'memory';
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'false';
    listPlatformApiAudit.mockClear();
  });

  afterEach(() => {
    process.env.YAWP_INTERNAL_API_KEYS = saved.keys;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = saved.management;
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = saved.legacy;
    if (saved.nonceStore === undefined) delete process.env.INTERNAL_API_NONCE_STORE;
    else process.env.INTERNAL_API_NONCE_STORE = saved.nonceStore;
  });

  test('requires audit:read and never returns request bodies', async () => {
    const { loader } = await import('./route');
    const { signInternalApiRequest, resetInternalApiMemoryNonceStore } = await import(
      '~/utils/internal-platform-auth.server'
    );
    resetInternalApiMemoryNonceStore();

    const url = 'https://yawp.test/api/internal/v1/audit?since=2026-10-01&until=2026-10-08';
    const unsigned = await loader({ request: new Request(url) });
    expect(unsigned.status).toBe(401);

    const wrongScope = signInternalApiRequest({
      method: 'GET',
      url,
      keyId: 'flags',
      secret: `${secret}-flags`,
      actor: 'ops@yawp.school',
    });
    const forbidden = await loader({
      request: new Request(url, { method: 'GET', headers: wrongScope.headers }),
    });
    expect(forbidden.status).toBe(403);

    const signed = signInternalApiRequest({
      method: 'GET',
      url,
      keyId: 'auditor',
      secret,
      actor: 'auditor@yawp.school',
    });
    const ok = await loader({
      request: new Request(url, { method: 'GET', headers: signed.headers }),
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.events[0]).toEqual({
      id: 'evt-1',
      keyId: 'writer',
      actor: 'ops@yawp.school',
      method: 'POST',
      endpoint: '/api/internal/v1/feature-flags/demo',
      result: 'authorized',
      timestamp: '2026-10-02T12:00:00.000Z',
    });
    expect(JSON.stringify(body)).not.toContain('requestHash');
    expect(listPlatformApiAudit).toHaveBeenCalledTimes(1);
  });
});
