import { describe, expect, test } from 'bun:test';
import { isLocalDevAuthEnabled } from '~/utils/local-dev-auth.server';

describe('local dev auth', () => {
  test('is enabled only for development on localhost databases', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalDatabaseUrl = process.env.DATABASE_URL;

    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/yawp';
    expect(isLocalDevAuthEnabled()).toBe(true);

    process.env.NODE_ENV = 'production';
    expect(isLocalDevAuthEnabled()).toBe(false);

    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@prod.example.com:5432/yawp';
    expect(isLocalDevAuthEnabled()).toBe(false);

    process.env.NODE_ENV = originalNodeEnv;
    process.env.DATABASE_URL = originalDatabaseUrl;
  });
});
