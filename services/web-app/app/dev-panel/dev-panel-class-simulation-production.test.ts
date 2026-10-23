import { describe, expect, test } from 'bun:test';
import { assertDevPanelRoute } from './dev-panel-route-guard.server';

const productionEnvKeys = [
  'YAWP_ENVIRONMENT',
  'PREVIEW_SLUG',
  'PR_NUMBER',
  'PREVIEW_ACCESS_GATE',
  'NODE_ENV',
  'DATABASE_URL',
] as const;

function restoreProcessEnv(
  previous: Record<(typeof productionEnvKeys)[number], string | undefined>
) {
  const env = process.env as Record<string, string | undefined>;
  for (const key of productionEnvKeys) {
    if (previous[key] === undefined) delete env[key];
    else env[key] = previous[key];
  }
}

function snapshotProcessEnv() {
  const previous = {} as Record<
    (typeof productionEnvKeys)[number],
    string | undefined
  >;
  for (const key of productionEnvKeys) {
    previous[key] = process.env[key];
  }
  return previous;
}

describe('class simulation dev panel routes in production', () => {
  test('class simulation POST returns 404 in production', async () => {
    const previous = snapshotProcessEnv();
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = 'production';
    delete env.YAWP_ENVIRONMENT;
    delete env.PREVIEW_SLUG;
    try {
      const response = await assertDevPanelRoute(
        new Request('http://localhost/api/dev-panel/class-simulation', {
          method: 'POST',
        })
      );
      expect(response?.status).toBe(404);
    } finally {
      restoreProcessEnv(previous);
    }
  });

  test('teacher-classes loader returns 404 in production', async () => {
    const previous = snapshotProcessEnv();
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = 'production';
    delete env.YAWP_ENVIRONMENT;
    try {
      const response = await assertDevPanelRoute(
        new Request('http://localhost/api/dev-panel/teacher-classes')
      );
      expect(response?.status).toBe(404);
    } finally {
      restoreProcessEnv(previous);
    }
  });
});
