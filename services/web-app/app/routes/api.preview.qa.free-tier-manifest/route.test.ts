import { describe, expect, test, beforeEach, afterEach } from 'bun:test';

const originalEnv = process.env.YAWP_ENVIRONMENT;

describe('api.preview.qa.free-tier-manifest', () => {
  beforeEach(() => {
    process.env.YAWP_ENVIRONMENT = 'production';
  });
  afterEach(() => {
    process.env.YAWP_ENVIRONMENT = originalEnv;
  });

  test('returns 404 outside preview', async () => {
    const { loader } = await import('./route');
    const response = await loader({
      request: new Request('https://yawp.test/api/preview/qa/free-tier-manifest?email=a@b.c'),
    } as never);
    expect(response.status).toBe(404);
  });
});
