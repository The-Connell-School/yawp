import { describe, expect, test } from 'bun:test';
import { assertDevPanelRoute } from './dev-panel-route-guard.server';

const keys = [
  'YAWP_ENVIRONMENT',
  'PREVIEW_SLUG',
  'PR_NUMBER',
  'NODE_ENV',
  'DATABASE_URL',
] as const;

describe('assertDevPanelRoute', () => {
  test('returns 404 in production', async () => {
    const previous = {} as Record<(typeof keys)[number], string | undefined>;
    for (const key of keys) previous[key] = process.env[key];
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/yawp',
    });
    delete process.env.YAWP_ENVIRONMENT;
    delete process.env.PREVIEW_SLUG;
    delete process.env.PR_NUMBER;
    try {
      const response = await assertDevPanelRoute(
        new Request('http://localhost/api/dev-panel/orgs')
      );
      expect(response?.status).toBe(404);
    } finally {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });
});
