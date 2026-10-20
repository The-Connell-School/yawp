import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { FREE_CLASSROOM_LESSON_PLAN_QUOTA } from '~/utils/entitlements.server';

const count = mock();
let v2 = false;
let limits = {
  studentSeatCap: 35,
  lessonPlannerMonthly: 2,
  reporterMonthly: 2,
  version: 1,
  updatedAt: '2026-10-16T00:00:00.000Z',
  updatedByEmail: 'staff@example.test',
};
const settingFindMany = mock(async ({ where }: { where: { name?: { in?: string[] } | string } }) => {
  const names = Array.isArray(where.name?.in)
    ? where.name.in
    : typeof where.name === 'string'
      ? [where.name]
      : [];
  return names.flatMap((name) => {
    if (name === 'feature_flag.free_tier')
      return [
        {
          name,
          value: v2
            ? '{"mode":"everyone","orgIds":[]}'
            : '{"mode":"off","orgIds":[]}',
        },
      ];
    return [];
  });
});
const setting = mock(async ({ where }: any) => {
  if (where.name === 'free_tier.limits.v1')
    return { value: JSON.stringify(limits) };
  return null;
});

mock.module('~/utils/db.server', () => ({
  prisma: {
    $transaction: async (fn: any) =>
      fn({
        $executeRaw: async () => {},
        setting: { findMany: settingFindMany, findUnique: setting },
        lessonPlanConversation: { count },
      }),
    lessonPlanConversation: { count },
    setting: { findUnique: setting, findMany: settingFindMany },
  },
}));

const {
  LessonPlanQuotaExceededError,
  assertCanCreateLessonPlan,
  lessonPlanQuotaMessage,
} = await import('./lesson-planner-quota.server');

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  count.mockReset();
  setting.mockClear();
  settingFindMany.mockClear();
  v2 = false;
  limits.lessonPlannerMonthly = 2;
});

describe('assertCanCreateLessonPlan', () => {
  test('allows school plans regardless of count', async () => {
    count.mockResolvedValue(100);
    await expect(
      assertCanCreateLessonPlan({
        organizationId: 'org-1',
        plan: 'SCHOOL',
      })
    ).resolves.toBeUndefined();
    expect(count).not.toHaveBeenCalled();
    expect(setting).not.toHaveBeenCalled();
  });

  test('refuses free classroom orgs at the quota', async () => {
    count.mockResolvedValue(FREE_CLASSROOM_LESSON_PLAN_QUOTA);
    await expect(
      assertCanCreateLessonPlan({
        organizationId: 'org-1',
        plan: 'FREE_CLASSROOM',
      })
    ).rejects.toBeInstanceOf(LessonPlanQuotaExceededError);
  });

  test('allows free classroom orgs below the quota', async () => {
    count.mockResolvedValue(FREE_CLASSROOM_LESSON_PLAN_QUOTA - 1);
    await expect(
      assertCanCreateLessonPlan({
        organizationId: 'org-1',
        plan: 'FREE_CLASSROOM',
      })
    ).resolves.toBeUndefined();
  });

  test('flag off retains the lifetime undeleted-draft query and default quota', async () => {
    count.mockResolvedValue(4);
    await assertCanCreateLessonPlan({
      organizationId: 'org-1',
      plan: 'FREE_CLASSROOM',
    });
    expect(count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', deletedAt: null },
    });
    expect(
      setting.mock.calls.some(
        ([args]) => args.where.name === 'free_tier.limits.v1'
      )
    ).toBe(false);
  });
  test('v2 uses configured monthly quotas, counting deleted records too', async () => {
    v2 = true;
    count.mockResolvedValue(2);
    await expect(
      assertCanCreateLessonPlan({
        organizationId: 'org-1',
        plan: 'FREE_CLASSROOM',
      })
    ).rejects.toMatchObject({ quota: 2, monthly: true });
    const { where } = count.mock.calls[0][0];
    expect(where.organizationId).toBe('org-1');
    expect(where.deletedAt).toBeUndefined();
    expect(where.createdAt.gte.getUTCDate()).toBe(1);
    expect(where.createdAt.gte.getUTCHours()).toBe(0);
    expect(where.createdAt.lt.getUTCDate()).toBe(1);
    expect(where.createdAt.lt.getTime()).toBeGreaterThan(
      where.createdAt.gte.getTime()
    );
  });
  test('zero monthly quota blocks creation without changing paid access', async () => {
    v2 = true;
    limits.lessonPlannerMonthly = 0;
    count.mockResolvedValue(0);
    await expect(
      assertCanCreateLessonPlan({
        organizationId: 'org-1',
        plan: 'FREE_CLASSROOM',
      })
    ).rejects.toMatchObject({ quota: 0 });
    await expect(
      assertCanCreateLessonPlan({ organizationId: 'org-1', plan: 'SCHOOL' })
    ).resolves.toBeUndefined();
  });
});

describe('lessonPlanQuotaMessage', () => {
  test('names the limit in teacher language', () => {
    expect(lessonPlanQuotaMessage(4)).toContain('4 lesson plans');
  });
  test('monthly message never suggests deleting a draft to restore quota', () => {
    expect(lessonPlanQuotaMessage(2, true)).toContain('this month');
    expect(lessonPlanQuotaMessage(2, true)).not.toContain('delete');
  });
});
