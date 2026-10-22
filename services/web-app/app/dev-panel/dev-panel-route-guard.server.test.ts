import { describe, expect, test } from 'bun:test';
import { assertDevPanelRoute } from './dev-panel-route-guard.server';

describe('assertDevPanelRoute', () => {
  test('returns 404 in production', async () => {
    const prior = process.env.YAWP_ENVIRONMENT;
    process.env.YAWP_ENVIRONMENT = 'production';
    try {
      const response = await assertDevPanelRoute(
        new Request('http://localhost/api/dev-panel/orgs')
      );
      expect(response?.status).toBe(404);
    } finally {
      if (prior === undefined) delete process.env.YAWP_ENVIRONMENT;
      else process.env.YAWP_ENVIRONMENT = prior;
    }
  });
});
