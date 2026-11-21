import { expect, test } from 'bun:test';
import { canRedeemToken, getFreeTierReleaseCap, hashToken } from './service.server';
import { FREE_TIER_UNCAPPED } from './usage-budget.server';

test('hashToken uses sha256 hex', () => {
  const a = hashToken('abc');
  const b = hashToken('abc');
  const c = hashToken('abd');
  expect(a).toHaveLength(64);
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

test('canRedeemToken honors expiry and maxUses', () => {
  const now = Date.now();
  expect(
    canRedeemToken({
      uses: 0,
      maxUses: 1,
      expiresAt: new Date(now + 1000),
      bypassWaitlist: false,
      disabledAt: new Date(now - 1000),
    }).ok,
  ).toBe(false);
  expect(
    canRedeemToken({ uses: 0, maxUses: 1, expiresAt: new Date(now + 1000), bypassWaitlist: false }).ok,
  ).toBe(true);
  expect(
    canRedeemToken({ uses: 1, maxUses: 1, expiresAt: new Date(now + 1000), bypassWaitlist: false }).ok,
  ).toBe(false);
  expect(
    canRedeemToken({ uses: 0, maxUses: null, expiresAt: new Date(now - 1000), bypassWaitlist: false }).ok,
  ).toBe(false);
});


test('getFreeTierReleaseCap has no default cap in production; env still overrides', () => {
  const saved = { ...process.env };
  try {
    for (const k of ['FREE_TIER_RELEASE_CAP', 'PREVIEW_SLUG', 'YAWP_ENVIRONMENT', 'APP_ENV', 'PREVIEW_DEPLOYMENT_ID', 'RENDER_EXTERNAL_HOSTNAME', 'PLATFORM_HOST', 'HOSTNAME']) delete process.env[k];
    (process.env as Record<string, string>).NODE_ENV = 'production';
    expect(getFreeTierReleaseCap()).toBe(FREE_TIER_UNCAPPED);
    process.env.FREE_TIER_RELEASE_CAP = '25';
    expect(getFreeTierReleaseCap()).toBe(25);
    delete process.env.FREE_TIER_RELEASE_CAP;
    process.env.PREVIEW_SLUG = 'demo';
    expect(getFreeTierReleaseCap()).toBe(100);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
