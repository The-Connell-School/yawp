import { describe, expect, test } from 'bun:test';
import { rejectDevPanelInProduction } from './dev-panel-runtime.server';

const keys = [
  'YAWP_ENVIRONMENT',
  'PREVIEW_SLUG',
  'PR_NUMBER',
  'NODE_ENV',
  'DATABASE_URL',
] as const;

describe('dev panel production guard', () => {
  test('api guard returns 404 in production', () => {
    const previous = {} as Record<(typeof keys)[number], string | undefined>;
    for (const key of keys) previous[key] = process.env[key];
    Object.assign(process.env, {
      YAWP_ENVIRONMENT: undefined,
      PREVIEW_SLUG: undefined,
      PR_NUMBER: undefined,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/yawp',
    });
    delete process.env.YAWP_ENVIRONMENT;
    delete process.env.PREVIEW_SLUG;
    delete process.env.PR_NUMBER;
    try {
      const response = rejectDevPanelInProduction();
      expect(response?.status).toBe(404);
    } finally {
      const env = process.env as Record<string, string | undefined>;
      for (const key of keys) {
        if (previous[key] === undefined) delete env[key];
        else env[key] = previous[key];
      }
    }
  });
});
