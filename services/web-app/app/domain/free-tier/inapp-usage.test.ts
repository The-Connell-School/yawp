import { expect, test } from 'bun:test';
import {
  formatUsageRenewsLabel,
  lessonPlannerMonthlyWarning,
  usagePercent,
} from './inapp-usage';

test('usagePercent rounds and caps at 100', () => {
  expect(usagePercent({ used: 0, total: 5, remaining: 5 })).toBe(0);
  expect(usagePercent({ used: 3, total: 5, remaining: 2 })).toBe(60);
  expect(usagePercent({ used: 5, total: 5, remaining: 0 })).toBe(100);
});

test('lessonPlannerMonthlyWarning thresholds at 90 and 100', () => {
  const count = (used: number, total: number) => ({
    used,
    total,
    remaining: total - used,
  });
  expect(lessonPlannerMonthlyWarning(count(9, 10))).toBe('warning');
  expect(lessonPlannerMonthlyWarning(count(5, 5))).toBe('limit');
  expect(lessonPlannerMonthlyWarning(count(2, 5))).toBe('none');
});

test('formatUsageRenewsLabel uses UTC month and day', () => {
  expect(formatUsageRenewsLabel('2026-11-01T00:00:00.000Z')).toBe(
    'Renews November 1'
  );
});
