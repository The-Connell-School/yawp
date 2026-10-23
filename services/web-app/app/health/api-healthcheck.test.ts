import { describe, expect, mock, test } from 'bun:test';

const queryRaw = mock(async () => [{ '?column?': 1 }]);

mock.module('~/utils/db.server', () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

const { loader } = await import('~/routes/api.healthcheck');

describe('GET /api/healthcheck (liveness)', () => {
  test('returns 200 OK without querying the database', async () => {
    queryRaw.mockClear();
    const response = await loader({} as never);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('OK');
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
