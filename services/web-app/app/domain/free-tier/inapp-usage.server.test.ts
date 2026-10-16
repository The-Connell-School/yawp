import { test, expect, mock, beforeEach } from 'bun:test';
const classRead = mock(async (..._args: any[]) => ({
  id: 'class',
  code: 'CLASS',
}));
const count = mock(async () => 0);
let v2Value: string | null = null;
let freeTier = true;
const settingRead = mock(async ({ where }: any) => {
  const value =
    where.name === 'feature_flag.free_tier' ? String(freeTier) : v2Value;
  return value === null ? null : { value };
});
mock.module('~/utils/db.server', () => ({
  prisma: {
    setting: { findUnique: settingRead },
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
const profile = {
  id: 'teacher',
  role: 'TEACHER',
  organization: { id: 'org', plan: 'FREE_CLASSROOM' },
};
beforeEach(() => {
  v2Value = 'true';
  freeTier = true;
  classRead.mockClear();
  count.mockClear();
  settingRead.mockClear();
});
const { readFreeAccountUsage } = await import('./inapp-usage.server');
test('adapter reads authoritative usage, including invites and lifetime counts', async () => {
  const usage = await readFreeAccountUsage(profile, true);
  expect(usage!.students.remaining).toBe(21);
  expect(usage!.assignments.map((row) => row.remaining)).toEqual([9, 0, 3]);
  expect(usage!.lessonPlans.remaining).toBe(3);
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

for (const value of [null, 'false', '{"mode":"off","orgIds":[]}']) {
  test(`no v2 usage queries with missing/off Setting: ${value}`, async () => {
    v2Value = value;
    expect(await readFreeAccountUsage(profile, true)).toBeNull();
    expect(classRead).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
}
test('free-tier off prevents usage reads even with v2 on', async () => {
  expect(await readFreeAccountUsage(profile, false)).toBeNull();
  expect(settingRead).not.toHaveBeenCalled();
  expect(classRead).not.toHaveBeenCalled();
});
for (const change of [
  { role: 'STUDENT' },
  { organization: { id: 'org', plan: 'SCHOOL' } },
]) {
  test(`ineligible account does not read v2 usage: ${JSON.stringify(change)}`, async () => {
    expect(
      await readFreeAccountUsage({ ...profile, ...change }, true)
    ).toBeNull();
    expect(settingRead).not.toHaveBeenCalled();
    expect(classRead).not.toHaveBeenCalled();
  });
}
const { isFreeTierInappV2Enabled } =
  await import('./inapp-feature-gate.server');
test('independent loader gate requires both flags', async () => {
  freeTier = false;
  expect(await isFreeTierInappV2Enabled(profile)).toBe(false);
  freeTier = true;
  expect(await isFreeTierInappV2Enabled(profile)).toBe(true);
  v2Value = null;
  expect(await isFreeTierInappV2Enabled(profile)).toBe(false);
});
test('targeting respects the authenticated organization', async () => {
  v2Value = '{"mode":"targeted","orgIds":["other"]}';
  expect(await readFreeAccountUsage(profile, true)).toBeNull();
  expect(classRead).not.toHaveBeenCalled();
  v2Value = '{"mode":"targeted","orgIds":["org"]}';
  expect(await readFreeAccountUsage(profile, true)).not.toBeNull();
});
for (const deployment of ['demo', 'production']) {
  test(`${deployment} does not override a missing v2 setting`, async () => {
    const previous = process.env.YAWP_ENVIRONMENT;
    process.env.YAWP_ENVIRONMENT = deployment;
    try {
      v2Value = null;
      expect(await isFreeTierInappV2Enabled(profile)).toBe(false);
      expect(classRead).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.YAWP_ENVIRONMENT;
      else process.env.YAWP_ENVIRONMENT = previous;
    }
  });
}
