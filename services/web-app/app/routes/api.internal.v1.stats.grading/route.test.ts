import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as gradingStats from '~/utils/internal-grading-stats.server';

const managementKey = 's'.repeat(43);
const secret = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
const keyConfig = JSON.stringify([
  { id: 'stats', secret, scopes: ['stats:read'] },
]);

const loadGradingStats = mock(async () => [
  {
    day: '2026-10-02',
    organizationId: 'org-1',
    assignmentTypeId: 'type-1',
    outcome: 'success' as const,
    teacherNote: 'absent' as const,
    count: 2,
  },
]);

mock.module('~/utils/internal-grading-stats.server', () => ({
  ...gradingStats,
  loadGradingStats,
}));

describe('GET /api/internal/v1/stats/grading', () => {
  const saved = {
    keys: process.env.YAWP_INTERNAL_API_KEYS,
    management: process.env.YAWP_MANAGEMENT_SERVICE_KEY,
    nonceStore: process.env.INTERNAL_API_NONCE_STORE,
  };

  beforeEach(() => {
    process.env.YAWP_INTERNAL_API_KEYS = keyConfig;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = managementKey;
    process.env.INTERNAL_API_NONCE_STORE = 'memory';
    loadGradingStats.mockClear();
  });

  afterEach(() => {
    process.env.YAWP_INTERNAL_API_KEYS = saved.keys;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = saved.management;
    if (saved.nonceStore === undefined) delete process.env.INTERNAL_API_NONCE_STORE;
    else process.env.INTERNAL_API_NONCE_STORE = saved.nonceStore;
  });

  test('rejects unsigned requests and returns aggregate rows for stats:read', async () => {
    const { loader } = await import('./route');
    const { signInternalApiRequest, resetInternalApiMemoryNonceStore } = await import(
      '~/utils/internal-platform-auth.server'
    );
    resetInternalApiMemoryNonceStore();

    const unsigned = await loader({
      request: new Request(
        'https://yawp.test/api/internal/v1/stats/grading?since=2026-10-01&until=2026-10-08'
      ),
    });
    expect(unsigned.status).toBe(401);

    const statsUrl =
      'https://yawp.test/api/internal/v1/stats/grading?since=2026-10-01&until=2026-10-08';
    const signed = signInternalApiRequest({
      method: 'GET',
      url: statsUrl,
      keyId: 'stats',
      secret,
      actor: 'analyst@yawp.school',
    });
    const ok = await loader({
      request: new Request(statsUrl, { method: 'GET', headers: signed.headers }),
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.rows).toEqual([
      {
        day: '2026-10-02',
        organizationId: 'org-1',
        assignmentTypeId: 'type-1',
        outcome: 'success',
        teacherNote: 'absent',
        count: 2,
      },
    ]);
    expect(loadGradingStats).toHaveBeenCalledTimes(1);
  });
});
