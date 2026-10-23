import { describe, expect, test } from 'bun:test';
import { assertDevPanelRoute } from './dev-panel-route-guard.server';

const productionEnv = {
  YAWP_ENVIRONMENT: 'production',
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/yawp',
} as unknown as NodeJS.ProcessEnv;

describe('dev panel HTTP routes in production', () => {
  test('assertDevPanelRoute allows demo runtime (not 404 from env gate)', async () => {
    const previous = { ...process.env };
    Object.assign(process.env, {
      YAWP_ENVIRONMENT: 'preview',
      PREVIEW_SLUG: 'demo',
      PR_NUMBER: '',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@remote:5432/yawp',
      PREVIEW_ACCESS_GATE: 'on',
    });
    try {
      const response = await assertDevPanelRoute(
        new Request('http://localhost/api/dev-panel/orgs')
      );
      expect(response?.status).not.toBe(404);
    } finally {
      Object.assign(process.env, previous);
    }
  });

  test('assertDevPanelRoute returns 404', async () => {
    const previous = { ...process.env };
    Object.assign(process.env, productionEnv);
    try {
      const response = await assertDevPanelRoute(
        new Request('http://localhost/api/dev-panel/orgs')
      );
      expect(response?.status).toBe(404);
    } finally {
      Object.assign(process.env, previous);
    }
  });
});
