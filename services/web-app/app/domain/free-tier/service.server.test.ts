import { expect, test } from 'bun:test';
import { canRedeemToken, hashToken } from './service.server';

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
    canRedeemToken({ uses: 0, maxUses: 1, expiresAt: new Date(now + 1000), bypassWaitlist: false }).ok,
  ).toBe(true);
  expect(
    canRedeemToken({ uses: 1, maxUses: 1, expiresAt: new Date(now + 1000), bypassWaitlist: false }).ok,
  ).toBe(false);
  expect(
    canRedeemToken({ uses: 0, maxUses: null, expiresAt: new Date(now - 1000), bypassWaitlist: false }).ok,
  ).toBe(false);
});

