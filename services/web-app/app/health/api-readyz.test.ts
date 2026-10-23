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
  beforeEach(() => {
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    console.error = consoleError;
    consoleError.mockClear();
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
    queryRaw.mockRejectedValue(
      new Error('password authentication failed for user "secret"')
    );
    const { loader } = await import('~/routes/api.readyz');
    const response = await loader({} as never);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ ok: false, db: 'error' });
    expect(JSON.stringify(body)).not.toMatch(/secret|postgres|@/i);
    expect(consoleError).toHaveBeenCalled();
  });

  test('returns 503 when the database check times out', async () => {
    queryRaw.mockImplementation(
      () => new Promise(() => {})
    );
    const { isDatabaseReady, DB_READINESS_TIMEOUT_MS } = await import(
      '~/utils/db-readiness.server'
    );
    const start = Date.now();
    await expect(isDatabaseReady()).resolves.toBe(false);
    expect(Date.now() - start).toBeGreaterThanOrEqual(
      DB_READINESS_TIMEOUT_MS - 50
    );
  });
});
