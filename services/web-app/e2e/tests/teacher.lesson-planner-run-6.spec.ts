/**
 * Lesson Planner changes from Brian's sixth run
 * (docs/plans/2026-10-24-lesson-planner-brian-run-6.md).
 *
 * Every reply is seeded or stubbed: the model is never called. Each test turns
 * on the flags it needs and the afterEach turns every flag back off.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';
import { DAY_ONE_REPLY } from '../fixtures/lesson-planner/day-one-reply';

const TEACHER_PASSWORD = 'teacher-e2e-password';

const FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_stack_v2',
  'lesson_planner_stack_v3',
  'lesson_planner_deck_v2',
];

type Ctx = { teacherMembershipId: string; organizationId: string };
type Turn = { role: 'user' | 'assistant'; content: string };

const DECK = {
  title: 'The Things They Carried — Day 1',
  subtitle: 'English 11 · Period 5',
  slides: [
    { layout: 'title', title: 'The Things They Carried', subtitle: 'Day 1', speakerNotes: 'Let it sit.', minutes: 1 },
    { layout: 'prompt', title: 'Class starter', body: 'Write about something you carry every day.', speakerNotes: 'Eight minutes.', minutes: 8 },
    { layout: 'statement', title: 'Hold this question', body: 'Why does a list feel like the right form?', speakerNotes: 'Leave it up.', minutes: 5 },
    { layout: 'closing', title: 'Before you go', body: 'Exit ticket: open it in Yawp!', speakerNotes: 'Seven minutes.', minutes: 7 },
  ],
};

const DECK_REPLY = `Here is your deck.\n\n\`\`\`yawp-slides\n${JSON.stringify(DECK)}\n\`\`\``;

async function seedConversation(e2eContext: Ctx, turns: Turn[], title = 'Day One') {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title,
        periodMinutes: 50,
        lessonClassLabel: 'English 11 · Period 5',
        messages: {
          create: turns.map((turn, index) => ({ ...turn, createdAt: new Date(Date.UTC(2026, 9, 24, 10, 0, index)) })),
        },
      },
      select: { id: true, messages: { where: { role: 'assistant' }, orderBy: { createdAt: 'asc' }, select: { id: true } } },
    });
    return { conversationId: conversation.id, assistantIds: conversation.messages.map((message) => message.id) };
  } finally {
    await prisma.$disconnect();
  }
}

/** Day one in the stack, and a deck reply after it. */
async function seedStackWithDeckReply(page: import('@playwright/test').Page, e2eContext: Ctx) {
  const seeded = await seedConversation(e2eContext, [
    { role: 'user', content: 'Day one of The Things They Carried, English 11, 50 minutes.' },
    { role: 'assistant', content: DAY_ONE_REPLY },
    { role: 'user', content: 'Build the slide deck from my stack' },
    { role: 'assistant', content: DECK_REPLY },
  ]);
  const kept = await page.request.post('/api/domain/lesson-planner/packet', {
    form: { intent: 'keep-all', conversationId: seeded.conversationId, messageId: seeded.assistantIds[0]! },
  });
  expect(kept.ok()).toBe(true);
  return seeded;
}

async function fileDeck(page: import('@playwright/test').Page, conversationId: string, messageId: string) {
  const filed = await page.request.post('/api/domain/lesson-planner/packet', {
    form: { intent: 'add-material', conversationId, messageId, materialKey: 'deck' },
  });
  expect(filed.ok()).toBe(true);
}

test.describe("Lesson Planner — Brian's sixth run", () => {
  test.afterEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanConversation.deleteMany({ where: { membershipId: e2eContext.teacherMembershipId } });
    } finally {
      await prisma.$disconnect();
    }
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, false);
  });

  test.describe('item 3: Close goes back to where it was opened', () => {
    test('a deck opened from the chat closes to the chat', async ({ page, signIn, e2eContext }) => {
      for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedStackWithDeckReply(page, e2eContext);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      const card = page.getByTestId('slide-deck-card').last();
      await card.getByRole('link', { name: /present/i }).click();
      await expect(page.getByTestId('slide-counter')).toHaveText('1 / 4');
      await page.getByTestId('present-close').click();
      await expect(page).toHaveURL(new RegExp(`/app/lesson-planner\\?c=${conversationId}$`));
    });

    test('a deck opened from the stack closes to the stack', async ({ page, signIn, e2eContext }) => {
      for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId, assistantIds } = await seedStackWithDeckReply(page, e2eContext);
      await fileDeck(page, conversationId, assistantIds[1]!);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await page.getByTestId('deck-present').click();
      await expect(page.getByTestId('slide-counter')).toHaveText('1 / 4');
      await page.getByTestId('present-close').click();
      await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/packet$`));
    });

    test('the deck editor goes back to the chat or the stack, whichever opened it', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId, assistantIds } = await seedStackWithDeckReply(page, e2eContext);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await page.getByTestId('slide-deck-card').last().getByRole('link', { name: /edit/i }).click();
      await page.getByRole('link', { name: 'Back without saving' }).click();
      await expect(page).toHaveURL(new RegExp(`/app/lesson-planner\\?c=${conversationId}$`));

      await fileDeck(page, conversationId, assistantIds[1]!);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await page.getByTestId('take-to-class').getByRole('link', { name: 'Edit' }).click();
      await page.getByRole('link', { name: 'Back without saving' }).click();
      await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/packet$`));
    });

    test('handouts opened from the stack go back to the stack', async ({ page, signIn, e2eContext }) => {
      for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedStackWithDeckReply(page, e2eContext);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await page.getByTestId('handouts-print').click();
      await page.getByTestId('handouts-back').click();
      await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/packet$`));
    });
  });
});
