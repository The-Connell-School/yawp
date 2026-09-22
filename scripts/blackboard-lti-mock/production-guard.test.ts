import { afterEach, describe, expect, test } from 'bun:test';
import { assertBlackboardLtiMockAllowed } from './production-guard.mjs';

const original = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  Object.assign(process.env, original);
});

describe('assertBlackboardLtiMockAllowed', () => {
  test('refuses YAWP_ENVIRONMENT=production even when explicitly enabled', () => {
    expect(() =>
      assertBlackboardLtiMockAllowed({
        NODE_ENV: 'development',
        YAWP_ENVIRONMENT: 'production',
        BLACKBOARD_LTI_MOCK_ENABLED: 'true',
      })
    ).toThrow(/YAWP_ENVIRONMENT=production/);
  });

  test('refuses NODE_ENV=production unless this is a preview box', () => {
    expect(() =>
      assertBlackboardLtiMockAllowed({
        NODE_ENV: 'production',
        YAWP_ENVIRONMENT: 'staging',
        BLACKBOARD_LTI_MOCK_ENABLED: 'true',
      })
    ).toThrow(/NODE_ENV=production/);
  });

  test('refuses to start without an explicit enable flag', () => {
    expect(() =>
      assertBlackboardLtiMockAllowed({
        NODE_ENV: 'development',
        YAWP_ENVIRONMENT: 'development',
      })
    ).toThrow(/BLACKBOARD_LTI_MOCK_ENABLED/);
  });

  test('allows local development when explicitly enabled', () => {
    expect(() =>
      assertBlackboardLtiMockAllowed({
        NODE_ENV: 'development',
        BLACKBOARD_LTI_MOCK_ENABLED: 'true',
      })
    ).not.toThrow();
  });

  test('allows preview even when the web container uses NODE_ENV=production', () => {
    expect(() =>
      assertBlackboardLtiMockAllowed({
        NODE_ENV: 'production',
        YAWP_ENVIRONMENT: 'preview',
        BLACKBOARD_LTI_MOCK_ENABLED: 'true',
      })
    ).not.toThrow();
  });

  test('allows test runs', () => {
    expect(() =>
      assertBlackboardLtiMockAllowed({
        NODE_ENV: 'test',
        BLACKBOARD_LTI_MOCK_ENABLED: 'true',
      })
    ).not.toThrow();
  });
});
