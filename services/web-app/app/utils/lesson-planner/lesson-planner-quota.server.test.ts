import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { FREE_CLASSROOM_LESSON_PLAN_QUOTA } from '~/utils/entitlements.server';

const count = mock();

mock.module('~/utils/db.server', () => ({
  prisma: {
    lessonPlanConversation: { count },
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
});

describe('lessonPlanQuotaMessage', () => {
  test('names the limit in teacher language', () => {
    expect(lessonPlanQuotaMessage(4)).toContain('4 lesson plans');
  });
});
