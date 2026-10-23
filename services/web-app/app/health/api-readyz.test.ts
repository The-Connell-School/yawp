import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const queryRaw = mock(async () => [{ '?column?': 1 }]);
const consoleError = mock(() => {});

mock.module('~/utils/db.server', () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

const originalConsoleError = console.error;

describe('GET /api/readyz (readiness)', () => {
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

  test('returns 200 with db ok when SELECT 1 succeeds', async () => {
    const { loader } = await import('~/routes/api.readyz');
    const response = await loader({} as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, db: 'ok' });
  });

  test('returns 503 without error details when the database fails', async () => {
    const secretMessage = 'password authentication failed for user "secret"';
    queryRaw.mockRejectedValue(new Error(secretMessage));
    const { loader } = await import('~/routes/api.readyz');
    const response = await loader({} as never);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ ok: false, db: 'error' });
    expect(JSON.stringify(body)).not.toMatch(/secret|postgres|@/i);
    expect(consoleError).toHaveBeenCalled();
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain(secretMessage);
    expect(logged).not.toContain('secret');
  });

  test('returns 503 when the database check times out', async () => {
    queryRaw.mockImplementation(() => new Promise(() => {}));
    const { isDatabaseReady, DB_READINESS_TIMEOUT_MS } = await import(
      '~/utils/db-readiness.server'
    );
    const start = Date.now();
    await expect(isDatabaseReady()).resolves.toBe(false);
    expect(Date.now() - start).toBeGreaterThanOrEqual(
      DB_READINESS_TIMEOUT_MS - 50
    );
  });

  test('single-flights concurrent readiness checks', async () => {
    queryRaw.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([{ '?column?': 1 }]), 30);
        })
    );
    const { isDatabaseReady } = await import('~/utils/db-readiness.server');
    const results = await Promise.all([
      isDatabaseReady(),
      isDatabaseReady(),
      isDatabaseReady(),
    ]);
    expect(results).toEqual([true, true, true]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
