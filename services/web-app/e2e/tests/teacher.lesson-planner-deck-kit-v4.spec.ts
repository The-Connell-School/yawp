/**
 * The Lesson Deck Kit, spec v4.1 (Nov 11), behind `lesson_planner_deck_kit_v4`
 * with the gallery deck on. Every reply is seeded: the model is never called.
 * Each test turns on the flags it needs and the afterEach turns them off.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import {
  setLessonPlannerReviewFlag,
  type LessonPlannerReviewFlag,
} from '../feature-flags';
import {
  fenceSlideDeck,
  type SlideDeck,
} from '../../app/domain/lesson-planner/slide-deck';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_deck_v2',
  'lesson_planner_deck_gallery',
  'lesson_planner_deck_kit_v4',
];

const DECK: SlideDeck = {
  title: 'Body Paragraphs',
  unit: 'The Critical Essay',
  art: 'hokusai-great-wave',
  slides: [
    {
      layout: 'title',
      title: 'Body Paragraphs',
      subtitle: 'Build on your thesis',
      speakerNotes: 'Open.',
    },
    {
      layout: 'steps',
      title: 'Draft your topic sentence',
      bullets: ['Reread your thesis', 'Pick one reason'],
      minutes: 6,
      speakerNotes: 'Go.',
    },
    {
      layout: 'discuss',
      title: 'Quiz',
      question: 'Which of these is a claim?',
      choices: ['Nine chapters', 'Gatsby is lonely'],
      speakerNotes: 'Ask.',
    },
    {
      layout: 'discuss',
      title: 'Quiz',
      question: 'Which of these is a claim?',
      choices: ['Nine chapters', 'Gatsby is lonely'],
      answer: 2,
      speakerNotes: 'Reveal.',
    },
    {
      layout: 'exit',
      title: 'Before you go',
      body: 'Bring your draft tomorrow.',
      button: 'Exit ticket',
      speakerNotes: 'Close.',
    },
  ],
};
const REPLY = `Here is the deck.\n\n${fenceSlideDeck(DECK)}`;

type Ctx = { teacherMembershipId: string; organizationId: string };

async function seedConversation(
  e2eContext: Ctx,
  turns: Array<{ role: 'user' | 'assistant'; content: string }>
) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Body Paragraphs',
        periodMinutes: 50,
        messages: {
          create: turns.map((turn, index) => ({
            ...turn,
            createdAt: new Date(Date.UTC(2026, 10, 11, 10, 0, index)),
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

test.describe.serial('Lesson Deck Kit v4', () => {
  test.afterEach(async ({ e2eContext }) => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, false);
    await clearLessonPlans(e2eContext.teacherMembershipId);
  });

  test('Present draws the deck on cream, with labels and a split panel', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantIds } = await seedConversation(
      e2eContext,
      [
        { role: 'user', content: 'Build the slide deck for this lesson' },
        { role: 'assistant', content: REPLY },
      ]
    );
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/present/${conversationId}/${assistantIds[0]}`);
    await page.waitForLoadState('networkidle');

    const stage = page.getByTestId('slide-stage').first();
    await expect(stage.locator('[data-theme="kit-v4"]')).toBeVisible();
    await expect(stage.getByTestId('gallery-credit')).toContainText(
      'Katsushika Hokusai'
    );
    // Spec v4.1: the title in Fraunces Bold, and the font really loads.
    await expect(
      stage.getByText('Body Paragraphs', { exact: true }).first()
    ).toHaveCSS('font-family', /^Fraunces/);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          await document.fonts.ready;
          return document.fonts.check('700 40px Fraunces');
        })
      )
      .toBe(true);

    await page.keyboard.press('ArrowRight');
    await expect(stage.locator('[data-kit-role="panel"]')).toBeVisible();
    await expect(stage).toContainText('Draft your topic sentence');
    await expect(stage).not.toContainText('Do.');
    // Spec v4.1: no running head; the lesson's name is on the title slide only.
    await expect(stage).not.toContainText('Body Paragraphs');

    await page.keyboard.press('ArrowRight');
    await expect(stage).toContainText('Question 1 of 1');
    await expect(stage.getByTestId('gallery-answer')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(stage.getByTestId('gallery-answer')).toHaveCount(1);

    await page.keyboard.press('ArrowRight');
    await expect(stage).toContainText('Exit ticket: open it in Yawp!');
  });

  test('the PowerPoint download is the v4 deck', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantIds } = await seedConversation(
      e2eContext,
      [
        { role: 'user', content: 'Build the slide deck for this lesson' },
        { role: 'assistant', content: REPLY },
      ]
    );
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const response = await page.request.get(
      `/present/${conversationId}/${assistantIds[0]}.pptx`
    );
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('presentationml');
    // Spec v4.1: Fraunces Bold is built into the file.
    const body = Buffer.from(await response.body());
    expect(body.includes('ppt/fonts/font1.fntdata')).toBe(true);
  });

  test('flag off: the same deck in spec v3', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerReviewFlag('lesson_planner_deck_v2', true);
    await setLessonPlannerReviewFlag('lesson_planner_deck_gallery', true);
    const { conversationId, assistantIds } = await seedConversation(
      e2eContext,
      [
        { role: 'user', content: 'Build the slide deck for this lesson' },
        { role: 'assistant', content: REPLY },
      ]
    );
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/present/${conversationId}/${assistantIds[0]}`);
    await page.waitForLoadState('networkidle');
    const stage = page.getByTestId('slide-stage').first();
    await expect(stage.locator('[data-theme="gallery"]')).toBeVisible();
    await expect(stage.locator('[data-theme="kit-v4"]')).toHaveCount(0);
  });
});
