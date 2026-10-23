import { beforeEach, describe, expect, mock, test } from 'bun:test';

const queryRaw = mock(async () => [{ '?column?': 1 }]);

mock.module('~/utils/db.server', () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

const { loader } = await import('./api.healthcheck');

describe('GET /api/healthcheck (liveness)', () => {
  beforeEach(() => {
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  });

  test('returns 200 OK when the database responds', async () => {
    const response = await loader({} as never);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('OK');
  });

  test('returns 200 OK when the database is unavailable', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));
    const response = await loader({} as never);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('OK');
  });
});
