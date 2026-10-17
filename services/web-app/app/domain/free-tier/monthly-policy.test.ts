import { beforeEach, expect, mock, test } from 'bun:test';
let monthly = true;
let approved = true;
mock.module('./limits.server', () => ({
  effectiveFreeTierLimits: async () => ({
    monthly,
    limits: { studentSeatCap: 35, lessonPlannerMonthly: 5, reporterMonthly: 2 },
  }),
}));
const approvalRead = mock(async () => (approved ? { id: 'approved' } : null));
mock.module('~/utils/db.server', () => ({
  prisma: { freeTierApplication: { findFirst: approvalRead } },
}));
const { monthlyFreeTierPolicy } = await import('./monthly-policy.server');
beforeEach(() => {
  monthly = true;
  approved = true;
  approvalRead.mockClear();
});
test('requires approved eligible free plan, base access and onboarding targeting', async () => {
  expect(
    await monthlyFreeTierPolicy({ id: 'org', plan: 'FREE_CLASSROOM' })
  ).toMatchObject({ enabled: true, limits: { reporterMonthly: 2 } });
  approved = false;
  expect(
    (await monthlyFreeTierPolicy({ id: 'org', plan: 'FREE_CLASSROOM' })).enabled
  ).toBe(false);
  approved = true;
  monthly = false;
  expect(
    (await monthlyFreeTierPolicy({ id: 'org', plan: 'FREE_CLASSROOM' })).enabled
  ).toBe(false);
});
for (const plan of ['SCHOOL', 'CLASSROOM_LICENSE', 'FOUNDING_FACULTY'])
  test(`${plan} preserves existing policy without reads`, async () => {
    expect(
      (await monthlyFreeTierPolicy({ id: 'org', plan: plan as any })).enabled
    ).toBe(false);
    expect(approvalRead).not.toHaveBeenCalled();
  });
