/**
 * Brian's round 4 notes, Oct 28 (docs/plans/2026-10-28-brian-round-4.md).
 *
 * Every lesson and reply is seeded: the model is never called.
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
  'lesson_planner_stack_panel',
  'lesson_planner_teach_notes',
  'lesson_planner_library_v2',
  'lesson_planner_share',
];

type Ctx = { teacherMembershipId: string; organizationId: string };

const AT = new Date(Date.UTC(2026, 9, 28, 9));

const DECK = {
  title: 'The Things They Carried — Day 1',
  slides: [
    { layout: 'title', title: 'The Things They Carried', subtitle: 'Day 1', speakerNotes: 'Let it sit.', minutes: 1 },
    { layout: 'prompt', title: 'Class starter', body: 'Write about something you carry every day.', speakerNotes: 'Eight minutes.', minutes: 8 },
    { layout: 'statement', title: 'Hold this question', body: 'Why does a list feel like the right form?', speakerNotes: 'Leave it up.', minutes: 5 },
    { layout: 'closing', title: 'Before you go', body: 'Exit ticket: open it in Yawp!', speakerNotes: 'Seven minutes.', minutes: 7 },
  ],
};
const DECK_REPLY = `Here is your deck.\n\n\`\`\`yawp-slides\n${JSON.stringify(DECK)}\n\`\`\``;

/** Day one in the stack, and a deck the planner built on the stack, not added. */
async function seedStackDeck(page: import('@playwright/test').Page, ctx: Ctx) {
  const prisma = createE2EPrismaClient();
  let conversationId = '';
  let dayOneId = '';
  let deckId = '';
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: ctx.teacherMembershipId,
        organizationId: ctx.organizationId,
        title: 'Day One',
        periodMinutes: 50,
        lessonClassLabel: 'English 11 · Period 5',
      },
      select: { id: true },
    });
    conversationId = conversation.id;
    await prisma.lessonPlanMessage.create({
      data: { conversationId, role: 'user', content: 'Day one of The Things They Carried.', createdAt: new Date(AT.getTime()) },
    });
    dayOneId = (
      await prisma.lessonPlanMessage.create({
        data: { conversationId, role: 'assistant', content: DAY_ONE_REPLY, createdAt: new Date(AT.getTime() + 1) },
        select: { id: true },
      })
    ).id;
    await prisma.lessonPlanMessage.create({
      data: { conversationId, role: 'user', content: 'Build the slide deck from my stack', surface: 'stack', createdAt: new Date(AT.getTime() + 2) },
    });
    deckId = (
      await prisma.lessonPlanMessage.create({
        data: { conversationId, role: 'assistant', content: DECK_REPLY, surface: 'stack', createdAt: new Date(AT.getTime() + 3) },
        select: { id: true },
      })
    ).id;
  } finally {
    await prisma.$disconnect();
  }
  const kept = await page.request.post('/api/domain/lesson-planner/packet', {
    form: { intent: 'keep-all', conversationId, messageId: dayOneId },
  });
  expect(kept.ok()).toBe(true);
  return { conversationId, deckId };
}

/** A set-able lesson with a Class Starter, Daily Pages and an exit ticket, in a unit. */
async function seedWritingLesson(ctx: Ctx) {
  const prisma = createE2EPrismaClient();
  try {
    const unit = await prisma.lessonPlanUnit.create({
      data: { membershipId: ctx.teacherMembershipId, organizationId: ctx.organizationId, title: 'The Great Gatsby' },
    });
    const pieces = [
      { kind: 'class-starter', title: 'Quick write to open class', minutes: 5, audience: 'student', content: 'What does Gatsby want most?' },
      { kind: 'step', title: 'Background for today’s reading', minutes: 7, stepType: 'context', content: 'The Jazz Age, briefly.' },
      { kind: 'step', title: 'Read aloud together', minutes: 15, stepType: 'read_aloud', content: 'Chapter 4, the drive into the city.' },
      { kind: 'daily-pages', title: 'Daily Pages response', minutes: 15, audience: 'student', content: 'Write about a story someone told about themselves.' },
      { kind: 'step', title: 'Exit ticket', minutes: 8, stepType: 'closing', content: 'Exit ticket: is Gatsby telling the truth? One sentence and one quote.' },
    ];
    const day = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: ctx.teacherMembershipId,
        organizationId: ctx.organizationId,
        title: 'Gatsby’s story: chapter 4',
        unitId: unit.id,
        unitDay: 1,
        periodMinutes: 50,
        materials: {
          create: pieces.map((piece, index) => ({
            sourceMessageId: 'seed',
            sourceCreatedAt: new Date(AT.getTime() + index),
            blockKey: `b${index}`,
            slot: `s${index}`,
            kind: piece.kind,
            title: piece.title,
            audience: piece.audience ?? 'teacher',
            content: piece.content,
            minutes: piece.minutes,
            stepType: piece.stepType ?? null,
          })),
        },
      },
      select: { id: true },
    });
    return { unitId: unit.id, conversationId: day.id };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("Brian's round 4 (Oct 28)", () => {
  async function clear(ctx: Ctx) {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanConversation.deleteMany({ where: { membershipId: ctx.teacherMembershipId } });
      await prisma.lessonPlanUnit.deleteMany({ where: { membershipId: ctx.teacherMembershipId } });
      await prisma.lessonPlanCourse.deleteMany({ where: { membershipId: ctx.teacherMembershipId } });
    } finally {
      await prisma.$disconnect();
    }
  }
  test.beforeEach(async ({ e2eContext }) => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
    await clear(e2eContext);
  });
  test.afterEach(async ({ e2eContext }) => {
    await clear(e2eContext);
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, false);
  });

  test('2 and 3: a deck built on the stack can be edited, and Add it adds it with no panel', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId, deckId } = await seedStackDeck(page, e2eContext);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.waitForLoadState('networkidle');

    const print = page.getByTestId('print-for-class');
    await expect(print).toContainText('You built a deck here. It isn’t in the lesson yet');
    // 3: Edit, beside Present and Add it.
    await expect(print.getByTestId('built-deck-edit')).toHaveAttribute(
      'href',
      `/app/lesson-planner/${conversationId}/deck/${deckId}?from=stack`
    );

    // 3: the card in Ask the planner has Edit too.
    await page.getByRole('button', { name: 'Ask the planner' }).first().click();
    const card = page.getByTestId('stack-deck');
    await expect(card.getByTestId('deck-edit')).toHaveAttribute(
      'href',
      `/app/lesson-planner/${conversationId}/deck/${deckId}?from=stack`
    );
    await card.getByTestId('deck-edit').click();
    await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/deck/${deckId}\\?from=stack$`));
    await page.getByRole('link', { name: 'Back without saving' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/packet$`));
    await page.waitForLoadState('networkidle');

    // 2: Add it adds the deck right here.
    await print.getByTestId('add-conversation-deck').click();
    await expect(print).toContainText('4 slides from your stack');
    await expect(print.getByTestId('deck-edit')).toBeVisible();
    await expect(page.getByTestId('add-panel')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/packet$`));
  });

  test('4: This lesson is set throws confetti, raises the Yawp! logo and says "Yaaaawp!"', async ({ page, signIn, e2eContext }) => {
    // Speech, stubbed so the test can hear it.
    await page.addInitScript(() => {
      const spoken: string[] = [];
      (window as unknown as { spoken: string[] }).spoken = spoken;
      class Utterance {
        text: string;
        pitch = 1;
        rate = 1;
        volume = 1;
        voice: unknown = null;
        lang = '';
        constructor(text: string) {
          this.text = text;
        }
      }
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          getVoices: () => [{ name: 'Daniel', lang: 'en-GB' }],
          speak: (utterance: Utterance) => spoken.push(utterance.text),
          cancel: () => {},
        },
      });
    });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedWritingLesson(e2eContext);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('lesson-set-celebration')).toHaveCount(0);

    await page.getByTestId('set-lesson').click();
    const party = page.getByTestId('lesson-set-celebration');
    await expect(party).toBeVisible();
    await expect(party.getByTestId('celebration-confetti')).toBeVisible();
    await expect(party.getByRole('img', { name: 'Yawp!' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { spoken: string[] }).spoken)).toEqual(['Yaaaawp!']);
    await expect(page.getByTestId('lesson-set')).toBeVisible();
    // It never blocks the page, and it goes away by itself.
    await expect(party).toHaveCount(0, { timeout: 6000 });

    // A lesson that is already set doesn't celebrate again.
    await page.reload();
    await expect(page.getByTestId('lesson-set')).toBeVisible();
    await expect(page.getByTestId('lesson-set-celebration')).toHaveCount(0);
  });

  test('5: the student page puts the exit ticket in a purple box with the other prompts', async ({ page, signIn, e2eContext, browser }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedWritingLesson(e2eContext);
    const response = await page.request.post('/api/domain/lesson-planner/stack', {
      form: { intent: 'send-lesson', conversationId, audience: 'student', recipient: 'student@example.org', includes: 'daily-pages,handouts' },
    });
    expect(response.ok()).toBe(true);
    const { url } = (await response.json()) as { url: string };

    const stranger = await browser.newContext();
    const visitor = await stranger.newPage();
    await visitor.goto(url);
    await expect(visitor.getByTestId('shared-prompts-heading')).toHaveText('The writing prompts');
    await expect(visitor.getByTestId('shared-prompt-type')).toHaveText(['Class Starter', 'Daily Pages', 'Exit Ticket']);
    await expect(visitor.getByTestId('shared-prompt').nth(2)).toContainText('is Gatsby telling the truth?');
    await stranger.close();
  });

  test('1: the lesson in the unit view follows the design', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { unitId } = await seedWritingLesson(e2eContext);
    await page.goto(`/app/lesson-planner/library/unit/${unitId}`);

    // One card on the left: at a glance, the writing bars in their box, and Contents.
    const sidebar = page.getByTestId('unit-sidebar');
    await expect(sidebar.getByRole('heading', { name: 'Unit at a glance' })).toBeVisible();
    await expect(sidebar.getByTestId('unit-glance-lessons')).toHaveText('1');
    await expect(sidebar.getByTestId('unit-glance-writing')).toHaveText('28 min · 56%');
    await expect(sidebar.getByTestId('day-bars-box')).toContainText('Writing minutes, day by day');
    await expect(sidebar.getByRole('heading', { name: 'Contents' })).toBeVisible();
    await expect(sidebar.getByTestId('contents-row')).toHaveText(['Day 1Gatsby’s story: chapter 4Draft']);
    await expect(sidebar).toContainText('Hover between two days and click + to add a lesson right there.');

    // The chosen day's tab sits on the lesson card.
    await expect(page.getByTestId('day-tab').first()).toHaveAttribute('aria-selected', 'true');
    const preview = page.getByTestId('lesson-preview');
    await expect(page.getByTestId('preview-day')).toHaveText('Day 1 of 1');
    await expect(page.getByTestId('preview-title')).toHaveText('Gatsby’s story: chapter 4');
    await expect(preview.getByTestId('preview-status')).toHaveText('Draft');
    // The time bar: one segment per step, a writing line under the three writing steps.
    await expect(preview.getByTestId('preview-segment')).toHaveCount(5);
    await expect(preview.getByTestId('preview-writing-line')).toHaveCount(3);
    await expect(preview).toContainText('50 of 50 min');
    await expect(preview).toContainText('56% writing · 28 min');
    // The run of show in its box.
    await expect(preview.getByTestId('preview-run').locator('li')).toHaveCount(5);
    await expect(preview.getByTestId('preview-run').locator('li').nth(4)).toContainText('42′');
    await expect(preview.getByTestId('preview-run').locator('li').nth(4)).toContainText('Writing');
    // Footer.
    await expect(preview.getByRole('link', { name: 'Rework in the planner' })).toBeVisible();
    await expect(preview.getByTestId('preview-duplicate')).toBeVisible();
    await expect(preview.getByTestId('preview-move')).toBeVisible();
  });
});
