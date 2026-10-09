import { afterEach, describe, expect, test } from 'bun:test';
import { assertFreeTierRuntimeConfigured, FreeTierConfigError } from './free-tier-config.server';

const envBackup = {
  FREE_TIER_LINK_HMAC_SECRET: process.env.FREE_TIER_LINK_HMAC_SECRET,
  PRIMARY_APP_URL: process.env.PRIMARY_APP_URL,
  YAWP_ENVIRONMENT: process.env.YAWP_ENVIRONMENT,
  PREVIEW_SLUG: process.env.PREVIEW_SLUG,
  PREVIEW_DOMAIN: process.env.PREVIEW_DOMAIN,
  DATABASE_URL: process.env.DATABASE_URL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('assertFreeTierRuntimeConfigured', () => {
  test('fails closed when FREE_TIER_LINK_HMAC_SECRET is missing', () => {
    delete process.env.FREE_TIER_LINK_HMAC_SECRET;
    delete process.env.YAWP_ENVIRONMENT;
    process.env.PRIMARY_APP_URL = 'https://yawp.school';
    try {
      assertFreeTierRuntimeConfigured();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(FreeTierConfigError);
      expect((error as FreeTierConfigError).code).toBe('missing_hmac_secret');
    }
  });

  test('fails closed when PRIMARY_APP_URL is missing outside preview', () => {
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'test-secret';
    delete process.env.PRIMARY_APP_URL;
    delete process.env.YAWP_ENVIRONMENT;
    delete process.env.PREVIEW_SLUG;
    delete process.env.PREVIEW_DOMAIN;
    const db = process.env.DATABASE_URL;
    if (db?.includes('/yawp_pr_')) {
      process.env.DATABASE_URL = db.replace(/yawp_pr_\d+/, 'yawp_local_dev');
    }
    try {
      assertFreeTierRuntimeConfigured();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(FreeTierConfigError);
      expect((error as FreeTierConfigError).code).toBe('missing_primary_app_url');
    }
  });
});
