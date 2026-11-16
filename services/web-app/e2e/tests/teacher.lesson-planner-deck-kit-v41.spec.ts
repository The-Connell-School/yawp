/**
 * The Lesson Deck Kit, spec v4.1 (Nov 11), behind
 * `lesson_planner_deck_kit_v41` with spec v4 and the gallery deck on. Every
 * reply is seeded: the model is never called. Each test turns on the flags it
 * needs and the afterEach turns them off.
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
const V4_FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_deck_v2',
  'lesson_planner_deck_gallery',
  'lesson_planner_deck_kit_v4',
];
const FLAGS: LessonPlannerReviewFlag[] = [
  ...V4_FLAGS,
  'lesson_planner_deck_kit_v41',
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
      teacher: 'Ms. Okafor',
      course: 'English 10, November 12',
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
      layout: 'big_idea',
      title: 'Idea',
      body: 'Great thesis statements lead to great essays.',
      speakerNotes: 'Say it.',
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

async function seedConversation(e2eContext: Ctx) {
  const prisma = createE2EPrismaClient();
  try {
    const turns = [
      { role: 'user', content: 'Build the slide deck for this lesson' },
      { role: 'assistant', content: REPLY },
    ];
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Body Paragraphs',
        periodMinutes: 50,
        messages: {
          create: turns.map((turn, index) => ({
            ...turn,
            createdAt: new Date(Date.UTC(2026, 10, 15, 10, 0, index)),
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
      assistantId: conversation.messages[0]!.id,
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

test.describe.serial('Lesson Deck Kit v4.1', () => {
  test.afterEach(async ({ e2eContext }) => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, false);
    await clearLessonPlans(e2eContext.teacherMembershipId);
  });

  test('Present: Fraunces headlines, the teacher on the title slide, no running head, no "Hold this"', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/present/${conversationId}/${assistantId}`);
    await page.waitForLoadState('networkidle');

    const stage = page.getByTestId('slide-stage').first();
    await expect(stage.locator('[data-kit="v4.1"]')).toBeVisible();

    // The title slide: the unit, the title in Fraunces Bold, then the
    // teacher's name and the class and date.
    const title = stage.getByText('Body Paragraphs', { exact: true });
    await expect(title).toHaveCSS('font-family', /Fraunces/);
    await expect(title).toHaveCSS('font-weight', '700');
    await expect(stage).toContainText('The Critical Essay');
    await expect(stage).toContainText('Ms. Okafor');
    await expect(stage).toContainText('English 10, November 12');
    await expect(stage).not.toContainText('Writing Program');
    // The font itself is served by the app.
    expect(
      await page.evaluate(async () => {
        await document.fonts.load('700 40px Fraunces');
        return document.fonts.check('700 40px Fraunces');
      })
    ).toBe(true);

    // A split slide: no running head, so the lesson's name is not on it.
    await page.keyboard.press('ArrowRight');
    await expect(stage.locator('[data-kit-role="panel"]')).toBeVisible();
    await expect(stage).toContainText('Draft your topic sentence');
    await expect(stage.getByTestId('gallery-running-head')).toHaveCount(0);
    await expect(stage).not.toContainText('Body Paragraphs');

    // The big idea is just the idea: no "Hold this".
    await page.keyboard.press('ArrowRight');
    await expect(stage).toContainText(
      'Great thesis statements lead to great essays.'
    );
    await expect(stage).not.toContainText('Hold this');

    await page.keyboard.press('ArrowRight');
    await expect(stage).toContainText('Before you go');
  });

  test('the PowerPoint download carries Fraunces Bold', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const response = await page.request.get(
      `/present/${conversationId}/${assistantId}.pptx`
    );
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('presentationml');
    // The embedded font's part is named in the zip's directory.
    expect((await response.body()).includes('ppt/fonts/Fraunces-bold.fntdata')).toBe(
      true
    );
  });

  test('v4.1 off: the same deck in spec v4, as before', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    for (const flag of V4_FLAGS) await setLessonPlannerReviewFlag(flag, true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/present/${conversationId}/${assistantId}`);
    await page.waitForLoadState('networkidle');
    const stage = page.getByTestId('slide-stage').first();
    await expect(stage.locator('[data-kit="v4"]')).toBeVisible();
    await expect(stage.locator('[data-kit="v4.1"]')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(stage.getByTestId('gallery-running-head')).toHaveCount(1);
  });

  test('v4.1 on without v4: spec v3, since v4.1 needs v4', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerReviewFlag('lesson_planner_deck_v2', true);
    await setLessonPlannerReviewFlag('lesson_planner_deck_gallery', true);
    await setLessonPlannerReviewFlag('lesson_planner_deck_kit_v41', true);
    const { conversationId, assistantId } = await seedConversation(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/present/${conversationId}/${assistantId}`);
    await page.waitForLoadState('networkidle');
    const stage = page.getByTestId('slide-stage').first();
    await expect(stage.locator('[data-theme="gallery"]')).toBeVisible();
    await expect(stage.locator('[data-theme="kit-v4"]')).toHaveCount(0);
  });
});
