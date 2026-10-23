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

/** Real production: NODE_ENV=production and no YAWP_ENVIRONMENT at runtime. */
const productionRuntimeEnv: Record<
  (typeof productionEnvKeys)[number],
  string | undefined
> = {
  YAWP_ENVIRONMENT: undefined,
  PREVIEW_SLUG: undefined,
  PR_NUMBER: undefined,
  PREVIEW_ACCESS_GATE: undefined,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/yawp',
};

describe('dev panel HTTP routes in production', () => {
  test('assertDevPanelRoute allows demo runtime (not 404 from env gate)', async () => {
    const previous = snapshotProcessEnv();
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
      restoreProcessEnv(previous);
    }
  });

  test('feedback route uses assertDevPanelRoute and returns 404 in production', async () => {
    const previous = snapshotProcessEnv();
    const env = process.env as Record<string, string | undefined>;
    for (const [key, value] of Object.entries(productionRuntimeEnv)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
    try {
      const response = await assertDevPanelRoute(
        new Request('http://localhost/api/dev-panel/feedback', { method: 'POST' })
      );
      expect(response?.status).toBe(404);
    } finally {
      restoreProcessEnv(previous);
    }
  });

  test('assertDevPanelRoute returns 404', async () => {
    const previous = snapshotProcessEnv();
    const env = process.env as Record<string, string | undefined>;
    for (const [key, value] of Object.entries(productionRuntimeEnv)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
    try {
      const response = await assertDevPanelRoute(
        new Request('http://localhost/api/dev-panel/orgs')
      );
      expect(response?.status).toBe(404);
    } finally {
      restoreProcessEnv(previous);
    }
  });
});
