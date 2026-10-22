import { beforeEach, expect, mock, test } from 'bun:test';
let monthly = true;
let applicationStatus: 'APPROVED' | 'SENT' | 'MANUAL_REVIEW' | null = 'APPROVED';
mock.module('./limits.server', () => ({
  effectiveFreeTierLimits: async () => ({
    monthly,
    limits: { studentSeatCap: 35, lessonPlannerMonthly: 5, reporterMonthly: 2 },
  }),
}));
const approvalRead = mock(async () =>
  applicationStatus ? { status: applicationStatus } : null
);
mock.module('~/utils/db.server', () => ({
  prisma: { freeTierApplication: { findFirst: approvalRead } },
}));
const { monthlyFreeTierPolicy } = await import('./monthly-policy.server');
beforeEach(() => {
  monthly = true;
  applicationStatus = 'APPROVED';
  approvalRead.mockClear();
});
test('requires approved eligible free plan, base access and onboarding targeting', async () => {
  expect(
    await monthlyFreeTierPolicy({ id: 'org', plan: 'FREE_CLASSROOM' })
  ).toMatchObject({
    enabled: true,
    lessonPlannerMeteringEnabled: true,
    limits: { reporterMonthly: 2 },
  });
  applicationStatus = null;
  expect(
    (await monthlyFreeTierPolicy({ id: 'org', plan: 'FREE_CLASSROOM' }))
      .enabled
  ).toBe(false);
  expect(
    (await monthlyFreeTierPolicy({ id: 'org', plan: 'FREE_CLASSROOM' }))
      .lessonPlannerMeteringEnabled
  ).toBe(false);
  applicationStatus = 'APPROVED';
  monthly = false;
  expect(
    (await monthlyFreeTierPolicy({ id: 'org', plan: 'FREE_CLASSROOM' })).enabled
  ).toBe(false);
});
test('pending SENT and MANUAL_REVIEW enable lesson planner metering without full monthly mode', async () => {
  for (const status of ['SENT', 'MANUAL_REVIEW'] as const) {
    applicationStatus = status;
    const policy = await monthlyFreeTierPolicy({
      id: 'org',
      plan: 'FREE_CLASSROOM',
    });
    expect(policy.enabled).toBe(false);
    expect(policy.lessonPlannerMeteringEnabled).toBe(true);
  }
});
for (const plan of ['SCHOOL', 'CLASSROOM_LICENSE', 'FOUNDING_FACULTY'])
  test(`${plan} preserves existing policy without reads`, async () => {
    expect(
      (await monthlyFreeTierPolicy({ id: 'org', plan: plan as any })).enabled
    ).toBe(false);
    expect(approvalRead).not.toHaveBeenCalled();
  });
