import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const queryRaw = mock(async () => [{ '?column?': 1 }]);
const consoleError = mock(() => {});

mock.module('~/utils/db.server', () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

const originalConsoleError = console.error;

describe('GET /api/healthcheck (deploy/LB probe)', () => {
  beforeEach(async () => {
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    console.error = consoleError;
    consoleError.mockClear();
    const { resetDatabaseReadinessCacheForTests } = await import(
      '~/utils/db-readiness.server'
    );
    resetDatabaseReadinessCacheForTests();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  test('returns 200 OK when the database is reachable', async () => {
    const { loader } = await import('~/routes/api.healthcheck');
    const response = await loader({} as never);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('OK');
    expect(queryRaw).toHaveBeenCalled();
  });

  test('returns 503 without leaking connection details when the database fails', async () => {
    const secretMessage = 'password authentication failed for user "secret"';
    queryRaw.mockRejectedValue(new Error(secretMessage));
    const { loader } = await import('~/routes/api.healthcheck');
    const response = await loader({} as never);
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toBe('UNAVAILABLE');
    expect(body).not.toMatch(/secret|postgres|@/i);
    expect(consoleError).toHaveBeenCalled();
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain(secretMessage);
    expect(logged).not.toContain('secret');
  });
});
