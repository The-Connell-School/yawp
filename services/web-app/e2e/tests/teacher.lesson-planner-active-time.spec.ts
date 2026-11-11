/**
 * "Planned in" is the time a teacher was working on a lesson, not the time
 * since it was started (Nov 3): the stack page counts working time and
 * reports it, and a set lesson shows that instead of creation-to-set.
 *
 * Every reply is seeded: the model is never called. Each test turns on the
 * flags it needs and the afterEach turns every flag back off.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';
import { DAY_ONE_REPLY } from '../fixtures/lesson-planner/day-one-reply';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const STACK_FLAGS: LessonPlannerReviewFlag[] = ['lesson_planner_stack_v2', 'lesson_planner_stack_v3'];
const ALL_FLAGS: LessonPlannerReviewFlag[] = [...STACK_FLAGS, 'lesson_planner_active_time'];
const DAY = 24 * 60 * 60 * 1000;

type Ctx = { teacherMembershipId: string; organizationId: string };

/** Day one in the stack, started three days ago. */
async function seedLesson(page: import('@playwright/test').Page, e2eContext: Ctx) {
  const started = new Date(Date.now() - 3 * DAY);
  const prisma = createE2EPrismaClient();
  let ids: { conversationId: string; messageId: string };
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Day One',
        periodMinutes: 50,
        createdAt: started,
        messages: {
          create: [
            { role: 'user', content: 'Day one of The Things They Carried, 50 minutes.', createdAt: started },
            { role: 'assistant', content: DAY_ONE_REPLY, createdAt: new Date(started.getTime() + 60_000) },
          ],
        },
      },
      select: { id: true, messages: { where: { role: 'assistant' }, select: { id: true } } },
    });
    ids = { conversationId: conversation.id, messageId: conversation.messages[0]!.id };
  } finally {
    await prisma.$disconnect();
  }
  const kept = await page.request.post('/api/domain/lesson-planner/packet', {
    form: { intent: 'keep-all', conversationId: ids.conversationId, messageId: ids.messageId },
  });
  expect(kept.ok()).toBe(true);
  return ids;
}

async function lessonRow(conversationId: string) {
  const prisma = createE2EPrismaClient();
  try {
    return await prisma.lessonPlanConversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { activeSeconds: true, activeSince: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function setLesson(conversationId: string, data: { activeSeconds?: number; activeSince?: Date }) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.lessonPlanConversation.update({ where: { id: conversationId }, data: { setAt: new Date(), ...data } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Lesson Planner — planning time is working time (Nov 3)', () => {
  test.afterEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanConversation.deleteMany({ where: { membershipId: e2eContext.teacherMembershipId } });
    } finally {
      await prisma.$disconnect();
    }
    for (const flag of ALL_FLAGS) await setLessonPlannerReviewFlag(flag, false);
  });

  test('flag off: "Planned in" is still first message to set, and nothing is counted', async ({ page, signIn, e2eContext }) => {
    for (const flag of STACK_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedLesson(page, e2eContext);
    const off = await page.request.post('/api/domain/lesson-planner/active-time', {
      multipart: { conversationId, seconds: '30' },
    });
    expect(off.status()).toBe(404);

    await setLesson(conversationId, {});
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const set = page.getByTestId('lesson-set');
    await expect(set).toContainText('from first message to set');
    await expect(set.getByTestId('stat-built')).toHaveText('3 days');
  });

  test('the stack page counts the time the teacher is working, and reports it when they leave', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of ALL_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedLesson(page, e2eContext);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.waitForLoadState('networkidle');
    // Working: the mouse moves for a few seconds.
    for (let i = 0; i < 6; i += 1) {
      await page.mouse.move(100 + i * 20, 200);
      await page.waitForTimeout(700);
    }
    // Leaving the page sends what was counted.
    await page.goto('/app/lesson-planner');
    await expect.poll(async () => (await lessonRow(conversationId)).activeSeconds, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    const row = await lessonRow(conversationId);
    expect(row.activeSeconds).toBeLessThanOrEqual(30);
    expect(row.activeSince).not.toBeNull();
  });

  test('a set lesson says how long the teacher worked on it, not how long ago it was started', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of ALL_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedLesson(page, e2eContext);
    // Measured from the start: 25 minutes of work over three days.
    await setLesson(conversationId, { activeSeconds: 25 * 60, activeSince: new Date(Date.now() - 3 * DAY - 60_000) });

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const set = page.getByTestId('lesson-set');
    await expect(set.getByTestId('stat-built')).toHaveText('25 min');
    await expect(set).toContainText('of actual work');
    await expect(set).not.toContainText('from first message to set');

    // A set lesson's clock has stopped: a report adds nothing.
    const report = await page.request.post('/api/domain/lesson-planner/active-time', {
      multipart: { conversationId, seconds: '30' },
    });
    expect((await report.json()).credited).toBe(0);
    expect((await lessonRow(conversationId)).activeSeconds).toBe(25 * 60);
  });

  test('a lesson from before the clock is estimated from its activity, breaks left out', async ({ page, signIn, e2eContext }) => {
    for (const flag of ALL_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedLesson(page, e2eContext);
    // Never counted: first message, a reply a minute later, then set three days on.
    await setLesson(conversationId, {});
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    // 1 minute to the reply, then the gap to set counts only up to 5 minutes.
    await expect(page.getByTestId('lesson-set').getByTestId('stat-built')).toHaveText('6 min');
  });
});
