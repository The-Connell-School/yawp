import { expect, test } from 'bun:test';
import { usageNavRingVisible } from '~/components/free-tier/usage-nav-ring';
import {
  usageNavCollapsedAccessibleName,
  usageNavLevelFromCount,
  usageNavMobileWarningDot,
  usageNavLevelHeadline,
  usagePercentLeft,
} from './usage-nav-meter';
import {
  USAGE_NAV_MOBILE_HIT_SIZE,
  USAGE_NAV_RING_SIZE_COLLAPSED,
} from '~/components/free-tier/usage-nav-ring-svg';
import { formatUsageRenewsLabel } from './inapp-usage';

const count = (remaining: number, total: number) => ({
  used: total - remaining,
  total,
  remaining,
});

test('usagePercentLeft uses remaining over total', () => {
  expect(usagePercentLeft(count(20, 100))).toBe(20);
  expect(usagePercentLeft(count(0, 5))).toBe(0);
});

test('usageNavLevelFromCount thresholds at 66, 33, and 0', () => {
  expect(usageNavLevelFromCount(count(67, 100))).toBe('plenty');
  expect(usageNavLevelFromCount(count(66, 100))).toBe('about-half');
  expect(usageNavLevelFromCount(count(34, 100))).toBe('about-half');
  expect(usageNavLevelFromCount(count(33, 100))).toBe('few');
  expect(usageNavLevelFromCount(count(1, 100))).toBe('few');
  expect(usageNavLevelFromCount(count(0, 100))).toBe('all-used');
});

test('all-used headline includes UTC renew date', () => {
  const renews = '2026-11-01T00:00:00.000Z';
  expect(usageNavLevelHeadline('all-used', renews)).toBe(
    `All used until ${formatUsageRenewsLabel(renews).replace(/^Renews /, '')}`
  );
});

test('usageNavMobileWarningDot only for few left', () => {
  expect(usageNavMobileWarningDot(['plenty', 'about-half'])).toBe(false);
  expect(usageNavMobileWarningDot(['few'])).toBe(true);
});

test('usageNavCollapsedAccessibleName matches frame 08 copy', () => {
  expect(
    usageNavCollapsedAccessibleName({
      feature: 'lesson-planner',
      count: count(20, 100),
    })
  ).toBe('Lesson Planner, A few left');
  expect(
    usageNavCollapsedAccessibleName({
      feature: 'reporter',
      count: count(80, 100),
    })
  ).toBe('Reporter, Plenty left');
});

test('collapsed and mobile hit targets use 44px', () => {
  expect(USAGE_NAV_RING_SIZE_COLLAPSED).toBe(44);
  expect(USAGE_NAV_MOBILE_HIT_SIZE).toBe(44);
});

test('hide-on-error is represented by absent ring render', () => {
  expect(usageNavRingVisible({ hidden: true, count: count(5, 10) })).toBe(
    false
  );
});
