/**
 * Lesson Planner changes from Brian's fifth run
 * (docs/plans/2026-10-23-lesson-planner-brian-run-5.md).
 *
 * Every reply is seeded: the model is never called. Each test turns on the
 * flags it needs and the afterEach turns every flag back off.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';
import { DAY_ONE_REPLY } from '../fixtures/lesson-planner/day-one-reply';

const TEACHER_PASSWORD = 'teacher-e2e-password';

const FLAGS: LessonPlannerReviewFlag[] = ['lesson_planner_stack_v2', 'lesson_planner_stack_v3'];

type Ctx = { teacherMembershipId: string; organizationId: string };
type Turn = { role: 'user' | 'assistant'; content: string };

async function seedConversation(e2eContext: Ctx, turns: Turn[], title = 'Lord of the Flies week') {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title,
        periodMinutes: 50,
        lessonClassLabel: 'English 10 · Period 3',
        messages: {
          create: turns.map((turn, index) => ({ ...turn, createdAt: new Date(Date.UTC(2026, 9, 23, 10, 0, index)) })),
        },
      },
      select: { id: true, messages: { where: { role: 'assistant' }, orderBy: { createdAt: 'asc' }, select: { id: true } } },
    });
    return { conversationId: conversation.id, assistantIds: conversation.messages.map((message) => message.id) };
  } finally {
    await prisma.$disconnect();
  }
}

async function stackOn() {
  for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
}

const WEEK = [
  '# Lord of the Flies: the first week',
  '',
  'Here is the four-day flow, building the runway before they fly.',
  '',
  '## Day 1: Lecture — the island (50 min)',
  '',
  '### Class starter (5 min) {type: class_starter}',
  'Write about a time the rules broke down.',
  '',
  '### Mini-lecture: Golding and the war (25 min) {type: context}',
  'The war behind the book.',
  '',
  '### Pair talk (10 min) {type: activity}',
  'What does the conch stand for?',
  '',
  '### Read aloud (5 min) {type: read_aloud}',
  'The opening page.',
  '',
  '### Closing (5 min) {type: closing}',
  'One rule you would make, and why.',
  '',
  '## Day 2: Close reading (50 min)',
  '',
  '### Class starter (5 min) {type: class_starter}',
  'Reread the conch scene.',
  '',
  '### Close reading (45 min) {type: activity}',
  'Annotate chapter 1 in pairs.',
].join('\n');

test.describe("Lesson Planner — Brian's fifth run", () => {
  test.afterEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanConversation.deleteMany({ where: { membershipId: e2eContext.teacherMembershipId } });
      await prisma.lessonPlanUnit.deleteMany({ where: { membershipId: e2eContext.teacherMembershipId } });
    } finally {
      await prisma.$disconnect();
    }
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, false);
  });

  test('items 1 and 3: each day becomes its own lesson, with every timed step, in a unit folder', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await stackOn();
    const { conversationId } = await seedConversation(e2eContext, [
      { role: 'user', content: 'Plan a 4-day flow for Lord of the Flies, English 10, 50 minutes a day.' },
      { role: 'assistant', content: WEEK },
    ]);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    // The days are days, not steps: nothing here files them into one stack.
    const card = page.getByTestId('day-lessons');
    await expect(card.getByTestId('day-lesson')).toHaveText([/Day 1 · Lecture — the island · 50 min/, /Day 2 · Close reading · 50 min/]);
    await expect(page.getByTestId('segment-toggle')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add everything to the stack' })).toHaveCount(0);

    await card.getByTestId('make-day-lessons').click();
    await expect(card.getByTestId('day-lesson-open')).toHaveCount(2);
    await expect(card.getByTestId('make-day-lessons')).toHaveCount(0);

    // Day 1 is a lesson of its own: five steps, 50 minutes.
    await card.getByTestId('day-lesson-open').first().click();
    await expect(page).toHaveURL(/\/packet$/);
    await expect(page.getByTestId('stack-title')).toHaveText('Day 1 — Lecture — the island');
    await expect(page.getByTestId('run-card')).toHaveCount(5);
    await expect(page.getByTestId('time-total')).toHaveText('50');

    // Making them again opens the same days, never a second set.
    const again = await page.request.post('/api/domain/lesson-planner/days', {
      form: { intent: 'make-days', conversationId, messageId: (await assistantId(conversationId))! },
    });
    expect(((await again.json()) as { days: Array<{ created: boolean }> }).days.every((day) => !day.created)).toBe(true);

    // The library holds the unit as a folder: its days in order, and the chat that planned it.
    await page.goto('/app/lesson-planner/library');
    const folder = page.getByTestId('unit-folder');
    await expect(folder.getByTestId('unit-folder-title')).toHaveText('Lord of the Flies: the first week');
    await expect(folder.getByTestId('history-lesson')).toHaveText([/Day 1 — Lecture — the island/, /Day 2 — Close reading/]);
    await expect(folder.getByTestId('unit-folder-planning')).toBeVisible();
    // Not loose rows as well.
    await expect(page.getByTestId('history-lesson')).toHaveCount(2);
  });

  test('a single lesson keeps its steps and its Add everything', async ({ page, signIn, e2eContext }) => {
    await stackOn();
    const { conversationId } = await seedConversation(e2eContext, [
      { role: 'user', content: 'Day one of The Things They Carried.' },
      { role: 'assistant', content: DAY_ONE_REPLY },
    ]);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    await expect(page.getByTestId('day-lessons')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add everything to the stack' })).toBeVisible();
  });
});

async function assistantId(conversationId: string) {
  const prisma = createE2EPrismaClient();
  try {
    const message = await prisma.lessonPlanMessage.findFirst({ where: { conversationId, role: 'assistant' }, select: { id: true } });
    return message?.id;
  } finally {
    await prisma.$disconnect();
  }
}
