import { expect, test } from 'bun:test';
import { getEntitlementsForPlan } from '~/utils/entitlements.server';
import { lessonPlanMonthWindow } from '~/utils/lesson-planner/lesson-planner-quota.server';
import { effectiveFreeTierLimits } from './limits.server';

test('configured seats include pending invites and never grant Reporter', () => {
  const limits = { studentSeatCap: 2, lessonPlannerMonthly: 0, reporterMonthly: 100 };
  const free = getEntitlementsForPlan('FREE_CLASSROOM', limits);
  expect(free.studentSeatCap).toBe(2); expect(free.features.lessonPlanQuota).toBe(0);
  expect(free.canAddStudent({ currentStudents: 1, pendingInvites: 1 })).toBe(false);
  expect(free.canAddStudent({ currentStudents: 3 })).toBe(false);
  expect(free.canAddStudent({ currentStudents: 1 })).toBe(true);
  expect(free.features.reporter).toBe(false);
  for (const plan of ['SCHOOL', 'FOUNDING_FACULTY', 'CLASSROOM_LICENSE'] as const) {
    const paid = getEntitlementsForPlan(plan, limits);
    expect(paid.studentSeatCap).toBeNull(); expect(paid.features.lessonPlanQuota).toBeNull();
    expect(paid.features.reporter).toBe(true); expect(paid.canAddStudent({ currentStudents: 500 })).toBe(true);
  }
});
test('calendar months use UTC fallback, half-open boundaries, leap days and year rollover', () => {
  expect(lessonPlanMonthWindow(new Date('2028-02-29T23:59:59.999Z'))).toEqual({
    gte: new Date('2028-02-01T00:00:00Z'), lt: new Date('2028-03-01T00:00:00Z'),
  });
  expect(lessonPlanMonthWindow(new Date('2026-12-31T23:59:59.999Z'))).toEqual({
    gte: new Date('2026-12-01T00:00:00Z'), lt: new Date('2027-01-01T00:00:00Z'),
  });
  expect(lessonPlanMonthWindow(new Date('2027-01-01T00:00:00Z')).gte).toEqual(new Date('2027-01-01T00:00:00Z'));
});
test('flag evaluation and configuration use the supplied transaction client', async () => {
  const names: string[] = [];
  const stored = { studentSeatCap: 9, lessonPlannerMonthly: 0, reporterMonthly: 2,
    version: 1, updatedAt: '2026-10-16T00:00:00.000Z', updatedByEmail: 'staff@example.test' };
  const rows: Record<string, string> = {
    'feature_flag.free_tier': 'true',
    'feature_flag.free-tier-onboarding-v2': JSON.stringify({ mode: 'targeted', orgIds: ['org'] }),
    'free_tier.limits.v1': JSON.stringify(stored),
  };
  const client = { setting: { findUnique: async ({ where }: any) => {
    names.push(where.name); return { value: rows[where.name] };
  } } } as any;
  const enabled = await effectiveFreeTierLimits('org', client);
  expect(enabled.monthly).toBe(true); expect(enabled.limits.studentSeatCap).toBe(9);
  expect(names).toEqual(['feature_flag.free_tier', 'feature_flag.free-tier-onboarding-v2', 'free_tier.limits.v1']);
  names.length = 0;
  expect((await effectiveFreeTierLimits('other', client)).limits.studentSeatCap).toBe(35);
  expect(names).not.toContain('free_tier.limits.v1');
});
