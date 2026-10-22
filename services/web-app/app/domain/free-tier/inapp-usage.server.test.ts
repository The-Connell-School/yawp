import { test, expect, mock, beforeEach, afterEach } from 'bun:test';
mock.module('./monthly-operations.server', () => ({
  readMonthlyUsage: async () => 1,
}));
const testLimits = {
  studentSeatCap: 10,
  lessonPlannerMonthly: 0,
  reporterMonthly: 100,
  version: 1,
  updatedAt: '2026-10-16T00:00:00.000Z',
  updatedByEmail: 'staff@example.test',
};
mock.module('./limits.server', () => ({
  effectiveFreeTierLimits: async () => ({
    monthly: true,
    limits: testLimits,
  }),
  readFreeTierLimits: async () => testLimits,
}));
let applicationStatus: 'APPROVED' | 'SENT' | 'MANUAL_REVIEW' | null = 'APPROVED';
let previousYawpEnvironment: string | undefined;
const classRead = mock(async (..._args: any[]) => ({
  id: 'class',
  code: 'CLASS',
}));
const count = mock(async () => 0);
let freeTierValue: string | null = 'true';
const settingRows = () => ({
  'feature_flag.free_tier': freeTierValue,
  'feature_flag.free-tier-onboarding-v2': null,
  'feature_flag.free-tier-inapp-v2': null,
  'free_tier.limits.v1': JSON.stringify({
    studentSeatCap: 10,
    lessonPlannerMonthly: 0,
    reporterMonthly: 100,
    version: 1,
    updatedAt: '2026-10-16T00:00:00.000Z',
    updatedByEmail: 'staff@example.test',
  }),
});
const settingRead = mock(async ({ where }: any) => {
  const rows = settingRows();
  const value = rows[where.name as keyof typeof rows];
  return value === null || value === undefined ? null : { value };
});
const settingReadMany = mock(async ({ where }: any) => {
  const rows = settingRows();
  return where.name.in
    .map((name: string) =>
      rows[name as keyof typeof rows] == null
        ? null
        : { name, value: rows[name as keyof typeof rows]! }
    )
    .filter(Boolean);
});
mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: {
      findFirst: async () => ({ status: applicationStatus }),
    },
    setting: { findUnique: settingRead, findMany: settingReadMany },
    class: { findFirst: classRead },
    document: { count },
  },
}));
mock.module('~/utils/assignment-quota.server', () => ({
  getFreeClassroomAssignmentQuotaUsage: async () =>
    new Map([
      ['class_starter', 3],
      ['prewriting', 3],
      ['thesis_statement', 0],
    ]),
}));
mock.module('./class-seat-cap.server', () => ({
  countFreeClassSeatUsage: async () => ({
    currentStudents: 12,
    pendingInvites: 2,
  }),
}));
mock.module('~/utils/lesson-planner/lesson-planner-quota.server', () => ({
  countOrganizationLessonPlans: async () => 2,
}));
mock.module('~/utils/rate-limit.server', () => ({
  readGradingLimitStatus: async () => null,
}));
const shouldHideFreeTierTeachingSecrets = mock(async () => false);
mock.module('./locked-preview.server', () => ({
  shouldHideFreeTierTeachingSecrets,
}));
const profile = {
  id: 'teacher',
  role: 'TEACHER',
  organization: { id: 'org', plan: 'FREE_CLASSROOM' },
};
beforeEach(() => {
  mock.module('./limits.server', () => ({
    effectiveFreeTierLimits: async () => ({
      monthly: true,
      limits: testLimits,
    }),
    readFreeTierLimits: async () => testLimits,
  }));
  previousYawpEnvironment = process.env.YAWP_ENVIRONMENT;
  delete process.env.YAWP_ENVIRONMENT;
  freeTierValue = 'true';
  applicationStatus = 'APPROVED';
  classRead.mockClear();
  count.mockClear();
  settingRead.mockClear();
  settingReadMany.mockClear();
  shouldHideFreeTierTeachingSecrets.mockClear();
  shouldHideFreeTierTeachingSecrets.mockResolvedValue(false);
});
afterEach(() => {
  if (previousYawpEnvironment === undefined) delete process.env.YAWP_ENVIRONMENT;
  else process.env.YAWP_ENVIRONMENT = previousYawpEnvironment;
});
const { readFreeAccountUsage } = await import('./inapp-usage.server');
test('pending approval hides class code from shell usage', async () => {
  shouldHideFreeTierTeachingSecrets.mockResolvedValue(true);
  freeTierValue = '{"mode":"targeted","orgIds":["org"]}';
  const usage = await readFreeAccountUsage(profile, true, 'user-1');
  expect(usage!.classCode).toBeNull();
  expect(usage!.classCodeHidden).toBe(true);
  expect(usage!.classId).toBe('class');
  expect(usage!.checklist.classReady).toBe(true);
});
test('pending LP metering keeps main sidebar monthly flag and adds LP fields', async () => {
  applicationStatus = 'SENT';
  freeTierValue = '{"mode":"targeted","orgIds":["org"]}';
  const usage = await readFreeAccountUsage(profile, true, 'user-1');
  expect(usage!.monthly).toBe(false);
  expect(usage!.lessonPlannerMonthlyMetering).toBe(true);
  expect(usage!.unlimitedFreeAssignmentTiles).toBe(true);
  expect(usage!.reporterLocked).toBe(true);
  expect(usage!.lessonPlannerMonthly?.used).toBe(2);
  expect(usage!.renewsAt).toBeDefined();
});

test('adapter reads authoritative usage, including invites and lifetime counts', async () => {
  freeTierValue = '{"mode":"targeted","orgIds":["org"]}';
  const usage = await readFreeAccountUsage(profile, true, 'user-1');
  expect(usage!.students.total).toBe(10);
  expect(usage!.students.remaining).toBe(0);
  expect(usage!.assignments.map((row) => row.remaining)).toEqual([9, 0, 3]);
  expect(usage!.lessonPlans.remaining).toBe(0);
  expect(classRead.mock.calls[0][0].where).toMatchObject({
    school: { organizationId: 'org' },
    teachers: { some: { id: 'teacher' } },
  });
  expect(usage!.checklist).toEqual({
    classReady: true,
    assignmentCreated: true,
    writingSubmitted: false,
    graded: false,
  });
});
test('free tier usage reflects configured caps without hiding excess students', async () => {
  freeTierValue = '{"mode":"everyone","orgIds":[]}';
  const usage = await readFreeAccountUsage(profile, true, 'user-1');
  expect(usage!.students.total).toBe(10);
  expect(usage!.students.remaining).toBe(0);
  expect(usage!.monthly).toBe(true);
  const now = new Date();
  expect(usage!.renewsAt).toBe(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString());
  expect(usage!.reporter).toEqual({ used: 1, total: 100, remaining: 99 });
  expect(usage!.lessonPlans.total).toBe(0);
  expect(usage!.lessonPlans.remaining).toBe(0);
});

for (const value of [null, 'false', '{"mode":"off","orgIds":[]}']) {
  test(`no usage queries with missing/off Setting: ${value}`, async () => {
    applicationStatus = null;
    freeTierValue = value;
    expect(await readFreeAccountUsage(profile, true, 'user-1')).toBeNull();
    expect(classRead).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
}
test('free-tier off prevents usage reads even when route gate is open', async () => {
  expect(await readFreeAccountUsage(profile, false, 'user-1')).toBeNull();
  expect(settingReadMany).not.toHaveBeenCalled();
  expect(classRead).not.toHaveBeenCalled();
});
for (const change of [
  { role: 'STUDENT' },
  { organization: { id: 'org', plan: 'SCHOOL' } },
]) {
  test(`ineligible account does not read usage: ${JSON.stringify(change)}`, async () => {
    expect(
      await readFreeAccountUsage({ ...profile, ...change }, true, 'user-1')
    ).toBeNull();
    expect(settingReadMany).not.toHaveBeenCalled();
    expect(classRead).not.toHaveBeenCalled();
  });
}
const { isFreeTierInappV2Enabled } =
  await import('./inapp-feature-gate.server');
test('loader gate requires free tier for the organization on production', async () => {
  const previous = process.env.YAWP_ENVIRONMENT;
  process.env.YAWP_ENVIRONMENT = 'production';
  try {
    freeTierValue = 'false';
    expect(await isFreeTierInappV2Enabled(profile)).toBe(false);
    freeTierValue = '{"mode":"targeted","orgIds":["org"]}';
    expect(await isFreeTierInappV2Enabled(profile)).toBe(true);
    freeTierValue = '{"mode":"targeted","orgIds":["other"]}';
    expect(await isFreeTierInappV2Enabled(profile)).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = previous;
  }
});
test('targeting respects the authenticated organization', async () => {
  applicationStatus = null;
  freeTierValue = '{"mode":"targeted","orgIds":["other"]}';
  expect(await readFreeAccountUsage(profile, true, 'user-1')).toBeNull();
  expect(classRead).not.toHaveBeenCalled();
  freeTierValue = '{"mode":"targeted","orgIds":["org"]}';
  expect(await readFreeAccountUsage(profile, true, 'user-1')).not.toBeNull();
});
test('production does not override a missing free-tier setting', async () => {
  const previous = process.env.YAWP_ENVIRONMENT;
  process.env.YAWP_ENVIRONMENT = 'production';
  try {
    freeTierValue = null;
    expect(await isFreeTierInappV2Enabled(profile)).toBe(false);
    expect(classRead).not.toHaveBeenCalled();
  } finally {
    if (previous === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = previous;
  }
});
test('demo enables in-app presentation without a stored setting row', async () => {
  const previous = process.env.YAWP_ENVIRONMENT;
  process.env.YAWP_ENVIRONMENT = 'demo';
  try {
    freeTierValue = null;
    expect(await isFreeTierInappV2Enabled(profile)).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = previous;
  }
});
