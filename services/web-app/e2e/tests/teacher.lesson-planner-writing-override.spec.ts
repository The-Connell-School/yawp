/**
 * The teacher's call on writing (Nov 4 follow-up): a lecture that introduces
 * a writing idea ("Pre-writing: the four moves") reads as writing by the
 * rule, and counts in the writing tally. The teacher can say it isn't, take
 * that back, and count a step the rule missed. And the finish line's button
 * says what it does: "Set this lesson".
 *
 * Every reply is seeded: the model is never called. Each test turns on the
 * flags it needs and the afterEach turns every flag back off.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const STACK_FLAGS: LessonPlannerReviewFlag[] = ['lesson_planner_stack_v2', 'lesson_planner_stack_v3'];
const ALL_FLAGS: LessonPlannerReviewFlag[] = [...STACK_FLAGS, 'lesson_planner_writing_override'];

const REPLY = [
  '# Pre-Writing',
  '',
  '## Pre-writing: the four moves (10 min)',
  '',
  'Slides on brainstorming, listing, mapping and freewriting, with an example of each.',
  '',
  '## Hook activity: What’s in your bag? (15 min)',
  '',
  'Students lay out what they carry. Pairs share.',
].join('\n');

type Ctx = { teacherMembershipId: string; organizationId: string };

async function seedLesson(page: import('@playwright/test').Page, e2eContext: Ctx) {
  const prisma = createE2EPrismaClient();
  let ids: { conversationId: string; messageId: string };
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Pre-Writing',
        periodMinutes: 50,
        messages: {
          create: [
            { role: 'user', content: 'Pre-writing, 50 minutes.', createdAt: new Date(Date.UTC(2026, 10, 4, 10, 0, 0)) },
            { role: 'assistant', content: REPLY, createdAt: new Date(Date.UTC(2026, 10, 4, 10, 0, 1)) },
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

async function writingCalls(conversationId: string) {
  const prisma = createE2EPrismaClient();
  try {
    const rows = await prisma.lessonPlanMaterial.findMany({
      where: { conversationId, kind: 'step' },
      select: { title: true, writing: true },
    });
    return Object.fromEntries(rows.map((row) => [row.title.replace(/\s*\(.*\)$/, ''), row.writing]));
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("Lesson Planner — the teacher's call on writing (Nov 4 follow-up)", () => {
  test.afterEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanConversation.deleteMany({ where: { membershipId: e2eContext.teacherMembershipId } });
    } finally {
      await prisma.$disconnect();
    }
    for (const flag of ALL_FLAGS) await setLessonPlannerReviewFlag(flag, false);
  });

  test('flag off: the rule decides, there is no toggle, and the button says "Set this lesson"', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of STACK_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedLesson(page, e2eContext);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const card = page.getByTestId('run-card').filter({ hasText: 'Pre-writing: the four moves' });
    await expect(card.getByTestId('writing-badge')).toBeVisible();
    await card.getByTestId('run-card-title').click();
    await expect(card.getByTestId('run-card-detail')).toBeVisible();
    await expect(card.getByTestId('step-writing-toggle')).toHaveCount(0);

    const off = await page.request.post('/api/domain/lesson-planner/stack', {
      form: { intent: 'set-writing', conversationId, materialId: 'x', writing: 'false' },
    });
    expect(off.status()).toBe(404);

    await expect(page.getByTestId('set-lesson')).toHaveText('Set this lesson');
    await expect(page.getByText('This lesson is set')).toHaveCount(0);
  });

  test('a lecture about pre-writing is taken out of the writing tally, undone, and set again', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of ALL_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedLesson(page, e2eContext);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const card = (title: string) => page.getByTestId('run-card').filter({ hasText: title });
    const lecture = card('Pre-writing: the four moves');
    const strip = page.getByTestId('writing-strip');

    // The rule counts the lecture: 10 of 50 minutes.
    await expect(lecture.getByTestId('writing-badge')).toBeVisible();
    await expect(strip).toContainText('20% of class is writing · 10 min');

    // Not writing: the badge goes, the tally drops, and Undo is offered.
    await lecture.getByTestId('run-card-title').click();
    const toggle = lecture.getByTestId('step-writing-toggle');
    await expect(toggle).toHaveText('Don’t count as writing');
    await toggle.click();
    await expect(lecture.getByTestId('writing-badge')).toHaveCount(0);
    await expect(strip).toContainText('0% of class is writing · 0 min');
    await expect(page.getByTestId('stack-change')).toContainText('Not counted as writing.');
    await expect.poll(async () => (await writingCalls(conversationId))['Pre-writing: the four moves']).toBe(false);

    // Undo puts it back as Yawp! had it.
    await page.getByTestId('stack-change').getByRole('button', { name: 'Undo' }).click();
    await expect(lecture.getByTestId('writing-badge')).toBeVisible();
    await expect(strip).toContainText('10 min');
    await expect.poll(async () => (await writingCalls(conversationId))['Pre-writing: the four moves']).toBeNull();

    // Taken out again, it stays out after a reload, marked as the teacher's call.
    if (!(await lecture.getByTestId('run-card-detail').isVisible())) await lecture.getByTestId('run-card-title').click();
    await lecture.getByTestId('step-writing-toggle').click();
    await expect(lecture.getByTestId('writing-badge')).toHaveCount(0);
    await expect.poll(async () => (await writingCalls(conversationId))['Pre-writing: the four moves']).toBe(false);
    await page.reload();
    await expect(lecture.getByTestId('writing-badge')).toHaveCount(0);
    await expect(strip).toContainText('0 min');
    await lecture.getByTestId('run-card-title').click();
    await expect(lecture.getByTestId('step-writing-your-call')).toBeVisible();

    // Counted again, it goes back to Yawp!'s own answer, not a second override.
    await expect(lecture.getByTestId('step-writing-toggle')).toHaveText('Count as writing');
    await lecture.getByTestId('step-writing-toggle').click();
    await expect(lecture.getByTestId('writing-badge')).toBeVisible();
    await expect.poll(async () => (await writingCalls(conversationId))['Pre-writing: the four moves']).toBeNull();
    await expect(lecture.getByTestId('step-writing-your-call')).toHaveCount(0);
  });

  test('a step the rule missed can be counted as writing', async ({ page, signIn, e2eContext }) => {
    for (const flag of ALL_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedLesson(page, e2eContext);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const hook = page.getByTestId('run-card').filter({ hasText: 'Hook activity' });
    await expect(hook.getByTestId('writing-badge')).toHaveCount(0);
    await hook.getByTestId('run-card-title').click();
    await hook.getByTestId('step-writing-toggle').click();
    await expect(hook.getByTestId('writing-badge')).toBeVisible();
    await expect(page.getByTestId('writing-strip')).toContainText('25 min');
    await expect(page.getByTestId('stack-change')).toContainText('Counted as writing.');
    await expect.poll(async () => (await writingCalls(conversationId))['Hook activity: What’s in your bag?']).toBe(true);
  });
});
