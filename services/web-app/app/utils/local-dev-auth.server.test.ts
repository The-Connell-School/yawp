import { afterEach, describe, expect, test } from 'bun:test';
import { isLocalDevAuthEnabled } from '~/utils/local-dev-auth.server';

const originalNodeEnv = process.env.NODE_ENV;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPreviewDataMode = process.env.PREVIEW_DATA_MODE;
const originalAccessGate = process.env.PREVIEW_ACCESS_GATE;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPreviewDataMode === undefined) {
    delete process.env.PREVIEW_DATA_MODE;
  } else {
    process.env.PREVIEW_DATA_MODE = originalPreviewDataMode;
  }
  if (originalAccessGate === undefined) {
    delete process.env.PREVIEW_ACCESS_GATE;
  } else {
    process.env.PREVIEW_ACCESS_GATE = originalAccessGate;
  }
});

describe('local dev auth', () => {
  test('is enabled for development with local seeded data', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/yawp';
    process.env.PREVIEW_DATA_MODE = 'seed';
    expect(isLocalDevAuthEnabled()).toBe(true);
  });

  test('remains enabled for ordinary local development without a preview mode', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/yawp';
    delete process.env.PREVIEW_DATA_MODE;

    expect(isLocalDevAuthEnabled()).toBe(true);
  });

  test('is disabled outside development or on a remote database', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/yawp';
    expect(isLocalDevAuthEnabled()).toBe(false);

    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@prod.example.com:5432/yawp';
    expect(isLocalDevAuthEnabled()).toBe(false);
  });

  test('refuses passwordless auth for production-dump preview data', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/yawp';
    process.env.PREVIEW_DATA_MODE = 'production-dump';

    expect(isLocalDevAuthEnabled()).toBe(false);
  });

  // Role-swap on deployed boxes is what the gate buys: the demo and preview hosts run
  // the production build against a remote-shaped database, so the old NODE_ENV +
  // local-URL rule refused them. Behind basic auth, everyone reaching the app has
  // already presented the global password.
  test('is enabled behind the shared access gate even on a production build', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@preview-postgres:5432/yawp_demo';
    process.env.PREVIEW_DATA_MODE = 'seed';
    process.env.PREVIEW_ACCESS_GATE = 'on';

    expect(isLocalDevAuthEnabled()).toBe(true);
  });

  test('production-dump data still refuses, gate or no gate', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@preview-postgres:5432/yawp_pr_1';
    process.env.PREVIEW_DATA_MODE = 'production-dump';
    process.env.PREVIEW_ACCESS_GATE = 'on';

    expect(isLocalDevAuthEnabled()).toBe(false);
  });

  // Fail closed: anything other than the exact flag render-compose emits is not a gate.
  test('a missing or malformed gate flag does not enable anything', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@preview-postgres:5432/yawp_demo';
    process.env.PREVIEW_DATA_MODE = 'seed';

    delete process.env.PREVIEW_ACCESS_GATE;
    expect(isLocalDevAuthEnabled()).toBe(false);

    process.env.PREVIEW_ACCESS_GATE = 'true';
    expect(isLocalDevAuthEnabled()).toBe(false);

    process.env.PREVIEW_ACCESS_GATE = '';
    expect(isLocalDevAuthEnabled()).toBe(false);
  });
});
