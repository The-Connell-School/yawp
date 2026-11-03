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
    'free_tier.limits.v1': JSON.stringify(stored),
  };
  const client = { setting: { findMany: async ({ where }: { where: { name: { in: string[] } } }) => {
    where.name.in.forEach((name) => names.push(name));
    return where.name.in
      .filter((name) => rows[name])
      .map((name) => ({ name, value: rows[name]! }));
  }, findUnique: async ({ where }: { where: { name: string } }) => {
    names.push(where.name);
    return rows[where.name] ? { value: rows[where.name]! } : null;
  } } } as any;
  const enabled = await effectiveFreeTierLimits('org', client);
  expect(enabled.monthly).toBe(true); expect(enabled.limits.studentSeatCap).toBe(9);
  expect(names).toContain('feature_flag.free_tier');
  expect(names).toContain('free_tier.limits.v1');
  names.length = 0;
  expect((await effectiveFreeTierLimits('other', client)).limits.studentSeatCap).toBe(9);
});
