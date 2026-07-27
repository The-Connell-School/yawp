import { afterEach, describe, expect, test } from 'bun:test';
import { isLocalDevAuthEnabled } from '~/utils/local-dev-auth.server';

const originalNodeEnv = process.env.NODE_ENV;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPreviewDataMode = process.env.PREVIEW_DATA_MODE;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPreviewDataMode === undefined) {
    delete process.env.PREVIEW_DATA_MODE;
  } else {
    process.env.PREVIEW_DATA_MODE = originalPreviewDataMode;
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
});
