import { describe, expect, test, beforeEach, afterEach } from 'bun:test';

const originalEnv = {
  YAWP_ENVIRONMENT: process.env.YAWP_ENVIRONMENT,
  DATABASE_URL: process.env.DATABASE_URL,
};

describe('api.preview.qa.free-tier-manifest', () => {
  beforeEach(() => {
    process.env.YAWP_ENVIRONMENT = 'production';
  });
  afterEach(() => {
    process.env.YAWP_ENVIRONMENT = originalEnv.YAWP_ENVIRONMENT;
    process.env.DATABASE_URL = originalEnv.DATABASE_URL;
  });

  test('returns 404 outside preview', async () => {
    const { loader } = await import('./route');
    const response = await loader({
      request: new Request('https://yawp.test/api/preview/qa/free-tier-manifest?email=a@b.c'),
    } as never);
    expect(response.status).toBe(404);
  });

  test('returns 404 on preview without yawp_pr database', async () => {
    process.env.YAWP_ENVIRONMENT = 'preview';
    process.env.DATABASE_URL = 'postgresql://x/yawp_demo';
    const { loader } = await import('./route');
    const response = await loader({
      request: new Request('https://yawp.test/api/preview/qa/free-tier-manifest?email=a@b.c'),
    } as never);
    expect(response.status).toBe(404);
  });
});
