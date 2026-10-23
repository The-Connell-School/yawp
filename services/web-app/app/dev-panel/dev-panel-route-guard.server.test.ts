import { describe, expect, test } from 'bun:test';
import {
  assertDevPanelRoute,
  assertDevPanelUnlockRoute,
} from './dev-panel-route-guard.server';

const keys = [
  'YAWP_ENVIRONMENT',
  'PREVIEW_SLUG',
  'PR_NUMBER',
  'PREVIEW_ACCESS_GATE',
  'NODE_ENV',
  'DATABASE_URL',
] as const;

function restoreEnv(previous: Record<(typeof keys)[number], string | undefined>) {
  const env = process.env as Record<string, string | undefined>;
  for (const key of keys) {
    if (previous[key] === undefined) delete env[key];
    else env[key] = previous[key];
  }
}

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
      restoreEnv(previous);
    }
  });
});

describe('assertDevPanelUnlockRoute', () => {
  test('returns 404 on a numbered PR preview host', async () => {
    const previous = {} as Record<(typeof keys)[number], string | undefined>;
    for (const key of keys) previous[key] = process.env[key];
    Object.assign(process.env, {
      YAWP_ENVIRONMENT: 'preview',
      PREVIEW_SLUG: 'pr-e2e-gate',
      PR_NUMBER: '1',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@remote:5432/yawp_pr_1',
      PREVIEW_ACCESS_GATE: 'on',
    });
    try {
      const response = await assertDevPanelUnlockRoute(
        new Request('http://localhost/api/dev-panel/preview-access')
      );
      expect(response?.status).toBe(404);
    } finally {
      restoreEnv(previous);
    }
  });

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
    delete process.env.PREVIEW_ACCESS_GATE;
    try {
      const response = await assertDevPanelUnlockRoute(
        new Request('http://localhost/api/dev-panel/preview-access')
      );
      expect(response?.status).toBe(404);
    } finally {
      restoreEnv(previous);
    }
  });

  test('allows demo runtime without a preview seat cookie', async () => {
    const previous = {} as Record<(typeof keys)[number], string | undefined>;
    for (const key of keys) previous[key] = process.env[key];
    Object.assign(process.env, {
      YAWP_ENVIRONMENT: 'preview',
      PREVIEW_SLUG: 'demo',
      PR_NUMBER: '',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@remote:5432/yawp',
      PREVIEW_ACCESS_GATE: 'on',
    });
    try {
      const response = await assertDevPanelUnlockRoute(
        new Request('http://localhost/api/dev-panel/preview-access')
      );
      expect(response).toBeNull();
    } finally {
      restoreEnv(previous);
    }
  });
});
