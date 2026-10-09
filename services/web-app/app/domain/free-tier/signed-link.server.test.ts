import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const saved = process.env.FREE_TIER_LINK_HMAC_SECRET;

beforeEach(() => {
  process.env.FREE_TIER_LINK_HMAC_SECRET = 'test-secret-for-free-tier-links-32chars';
});

afterEach(() => {
  if (saved === undefined) delete process.env.FREE_TIER_LINK_HMAC_SECRET;
  else process.env.FREE_TIER_LINK_HMAC_SECRET = saved;
});

describe('signed-link (no db)', () => {
  test('reports signing configured', async () => {
    const { isFreeTierLinkSigningConfigured } = await import('./signed-link.server');
    expect(isFreeTierLinkSigningConfigured()).toBe(true);
  });
});
