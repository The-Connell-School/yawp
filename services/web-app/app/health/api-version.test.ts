import { afterEach, describe, expect, test } from 'bun:test';

const saved = {
  YAWP_GIT_COMMIT: process.env.YAWP_GIT_COMMIT,
  YAWP_BUILT_AT: process.env.YAWP_BUILT_AT,
  YAWP_ENVIRONMENT: process.env.YAWP_ENVIRONMENT,
};

describe('GET /api/version', () => {
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('returns build metadata with cache-control no-store', async () => {
    process.env.YAWP_GIT_COMMIT = 'abc123def456';
    process.env.YAWP_BUILT_AT = '2026-10-23T00:00:00Z';
    process.env.YAWP_ENVIRONMENT = 'production';
    const { loader } = await import('~/routes/api.version');
    const response = await loader({} as never);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      commit: 'abc123def456',
      builtAt: '2026-10-23T00:00:00Z',
      environment: 'production',
    });
  });

  test('uses unknown placeholders when build env is unset', async () => {
    delete process.env.YAWP_GIT_COMMIT;
    delete process.env.YAWP_BUILT_AT;
    delete process.env.YAWP_ENVIRONMENT;
    const { loader } = await import('~/routes/api.version');
    const response = await loader({} as never);
    expect(await response.json()).toEqual({
      commit: 'unknown',
      builtAt: 'unknown',
      environment: 'unknown',
    });
  });
});
