import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const savedSecret = process.env.FREE_TIER_LINK_HMAC_SECRET;
const savedPrimary = process.env.PRIMARY_APP_URL;

beforeEach(() => {
  process.env.FREE_TIER_LINK_HMAC_SECRET =
    'test-secret-for-free-tier-links-32chars';
  process.env.PRIMARY_APP_URL = 'https://yawp.test';
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.FREE_TIER_LINK_HMAC_SECRET;
  else process.env.FREE_TIER_LINK_HMAC_SECRET = savedSecret;
  if (savedPrimary === undefined) delete process.env.PRIMARY_APP_URL;
  else process.env.PRIMARY_APP_URL = savedPrimary;
});

describe('buildAdminForwardPageSearch', () => {
  test('puts NRP token in t and approve token in approveT', async () => {
    const { buildAdminForwardPageSearch } = await import(
      './admin-approve-forward-link'
    );
    const approve = 'approve.token.opaque';
    const forward = 'forward.token.opaque';
    const search = buildAdminForwardPageSearch(forward, approve);
    const params = new URLSearchParams(search.slice(1));
    expect(params.get('t')).toBe(forward);
    expect(params.get('approveT')).toBe(approve);
    expect(params.get('t')).not.toBe(approve);
  });
});
