import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const saved = {
  hmac: process.env.FREE_TIER_LINK_HMAC_SECRET,
  nodeEnv: process.env.NODE_ENV,
  sessionSecret: process.env.SESSION_SECRET,
};

beforeEach(() => {
  process.env.FREE_TIER_LINK_HMAC_SECRET = 'test-secret-for-free-tier-links-32chars';
});

afterEach(() => {
  if (saved.hmac === undefined) delete process.env.FREE_TIER_LINK_HMAC_SECRET;
  else process.env.FREE_TIER_LINK_HMAC_SECRET = saved.hmac;
  if (saved.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = saved.nodeEnv;
  if (saved.sessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = saved.sessionSecret;
});

describe('signed-link (no db)', () => {
  test('reports signing configured', async () => {
    const { isFreeTierLinkSigningConfigured } = await import('./signed-link.server');
    expect(isFreeTierLinkSigningConfigured()).toBe(true);
  });

  test('worktree local dev can sign with SESSION_SECRET when HMAC secret is unset', async () => {
    delete process.env.FREE_TIER_LINK_HMAC_SECRET;
    process.env.NODE_ENV = 'development';
    process.env.SESSION_SECRET = 'worktree-local-dev-session-secret';
    const { isFreeTierLinkSigningConfigured } = await import('./signed-link.server');
    expect(isFreeTierLinkSigningConfigured()).toBe(true);
  });

  test('test env does not fall back to SESSION_SECRET when HMAC secret is unset', async () => {
    delete process.env.FREE_TIER_LINK_HMAC_SECRET;
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'test-session-secret';
    const { isFreeTierLinkSigningConfigured } = await import('./signed-link.server');
    expect(isFreeTierLinkSigningConfigured()).toBe(false);
  });

  test('production mint requires PRIMARY_APP_URL', async () => {
    const primary = process.env.PRIMARY_APP_URL;
    delete process.env.PRIMARY_APP_URL;
    delete process.env.YAWP_ENVIRONMENT;
    try {
      const { mintSignedLink } = await import('./signed-link.server');
      await expect(
        mintSignedLink({ applicationId: 'app-1', purpose: 'RELEASE' })
      ).rejects.toThrow(/PRIMARY_APP_URL/);
    } finally {
      if (primary === undefined) delete process.env.PRIMARY_APP_URL;
      else process.env.PRIMARY_APP_URL = primary;
    }
  });
});
