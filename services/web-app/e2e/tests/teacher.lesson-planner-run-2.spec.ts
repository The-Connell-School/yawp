/**
 * Lesson Planner changes from Brian's second run
 * (docs/plans/2026-10-12-lesson-planner-brian-run-2.md).
 *
 * Every reply is seeded: the model is never called. Most changes ride the
 * review flags, so each test turns on what it needs and the afterEach turns
 * every flag back off.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import {
  setLessonPlannerReviewFlag,
  type LessonPlannerReviewFlag,
} from '../feature-flags';

const TEACHER_PASSWORD = 'teacher-e2e-password';

const REVIEW_FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_intake_v2',
  'lesson_planner_stack_v2',
  'lesson_planner_deck_v2',
];

type Ctx = { teacherMembershipId: string; organizationId: string };
type Turn = { role: 'user' | 'assistant'; content: string };

async function seedConversation(
  e2eContext: Ctx,
  turns: Turn[],
  title = 'Run 2 lesson'
) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title,
        messages: {
          create: turns.map((turn, index) => ({
            ...turn,
            createdAt: new Date(Date.UTC(2026, 9, 12, 10, 0, index)),
          })),
        },
      },
      select: {
        id: true,
        messages: {
          where: { role: 'assistant' },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        },
      },
    });
    return {
      conversationId: conversation.id,
      assistantIds: conversation.messages.map((message) => message.id),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function clearLessonPlans(membershipId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.lessonPlanConversation.deleteMany({ where: { membershipId } });
  } finally {
    await prisma.$disconnect();
  }
}

const DECK = {
  title: 'The Things They Carried — Day 1',
  subtitle: 'English 11 · Period 5',
  slides: [
    { layout: 'title', title: 'The Things They Carried', subtitle: 'Day 1', speakerNotes: 'Let it sit.', minutes: 1 },
    { layout: 'prompt', title: 'Class starter', body: 'Write about something you carry every day.', speakerNotes: 'Eight minutes.', minutes: 8 },
    { layout: 'statement', title: 'Hold this question', body: 'Why does a list feel like the right form?', speakerNotes: 'Leave it up.', minutes: 5 },
    { layout: 'closing', title: 'Before you go', body: 'Exit ticket: open it in YAWP!', speakerNotes: 'Seven minutes.', minutes: 7 },
  ],
};

const DECK_REPLY = `Here is your deck.\n\n\`\`\`yawp-slides\n${JSON.stringify(DECK)}\n\`\`\``;

test.describe("Lesson Planner — Brian's second run", () => {
  test.afterEach(async ({ e2eContext }) => {
    await clearLessonPlans(e2eContext.teacherMembershipId);
    for (const flag of REVIEW_FLAGS) {
      await setLessonPlannerReviewFlag(flag, false);
    }
  });

  test.describe('S1: the deck in the stack', () => {
    test('Edit opens the deck editor, saving keeps the deck, and the card has every control', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      await setLessonPlannerReviewFlag('lesson_planner_deck_v2', true);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Build the slide deck for this lesson' },
        { role: 'assistant', content: DECK_REPLY },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await page.getByTestId('deck-toggle').click();
      await expect(page.getByTestId('deck-toggle')).toHaveText(/in the stack/i);

      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const section = page.getByTestId('packet-section').filter({
        has: page.getByTestId('slide-deck-card'),
      });
      await expect(section).toHaveCount(1);
      // The text editor never opens on a deck: that box is what wiped one.
      await expect(section.getByTestId('material-edit-start')).toHaveCount(0);
      await expect(section.getByTestId('section-remove')).toBeVisible();
      await expect(section.getByTestId('section-save-pdf')).toBeVisible();
      const card = section.getByTestId('slide-deck-card');
      await expect(card.getByRole('link', { name: 'Present' })).toBeVisible();
      await expect(card.getByTestId('deck-download-pptx')).toHaveText(
        'Save to PowerPoint'
      );

      await card.getByTestId('deck-edit').click();
      await expect(page.getByTestId('deck-editor-slide')).toHaveCount(4);
      await page.getByRole('button', { name: /^Slide 2:/ }).click();
      await page.getByLabel('Title', { exact: true }).fill('Warm-up: what you carry');
      await page.getByTestId('deck-editor-save').click();

      // Back to the stack, where the edit was started, with the deck intact.
      await expect(page).toHaveURL(
        new RegExp(`/app/lesson-planner/${conversationId}/packet`)
      );
      const saved = page.getByTestId('slide-deck-card');
      await expect(saved).toContainText('4 slides');
      await expect(saved.getByTestId('deck-edited-badge')).toBeVisible();
      await expect(page.getByTestId('packet-section')).not.toContainText('hhhh');
    });

    test('a text edit posted at a deck is refused and the deck survives', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Build the slide deck for this lesson' },
        { role: 'assistant', content: DECK_REPLY },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await page.getByTestId('deck-toggle').click();
      await expect(page.getByTestId('deck-toggle')).toHaveText(/in the stack/i);

      const prisma = createE2EPrismaClient();
      const deck = await prisma.lessonPlanMaterial.findFirstOrThrow({
        where: { conversationId, kind: 'slides' },
        select: { id: true },
      });
      await prisma.$disconnect();

      const response = await page.request.post('/api/domain/lesson-planner/packet', {
        form: {
          intent: 'edit-material',
          conversationId,
          materialId: deck.id,
          content: 'hhhh',
        },
      });
      expect(response.status()).toBe(400);

      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await expect(page.getByTestId('slide-deck-card')).toContainText('4 slides');
    });
  });

  test.describe('S2: files come from the stack, never from a chat chip', () => {
    test('a "Save Lesson Plan as PDF" chip is not shown; a link to the stack is', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan Day 1 of The Things They Carried.' },
        {
          role: 'assistant',
          content:
            '# The Things They Carried — Day 1\n\n## Class starter (8 min)\n\nWrite about something you carry.\n\n' +
            '## Reading (30 min)\n\nRead the first pages together.\n\n' +
            '```suggestions\nSave Lesson Plan as PDF\nPrint Lesson Plan\nMake a version for Period 3\n```',
        },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await expect(
        page.getByRole('button', { name: 'Make a version for Period 3' })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /Save Lesson Plan as PDF/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Print Lesson Plan/ })).toHaveCount(0);

      const toStack = page.getByTestId('open-stack-for-files');
      await expect(toStack).toHaveText(/Open the stack to download/);
      await toStack.click();
      await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/packet`));
    });
  });
});
