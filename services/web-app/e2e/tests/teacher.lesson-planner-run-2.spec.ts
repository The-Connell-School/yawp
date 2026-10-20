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
  'lesson_planner_stack_panel',
  'lesson_planner_plan_export_v2',
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
    { layout: 'closing', title: 'Before you go', body: 'Exit ticket: open it in Yawp!', speakerNotes: 'Seven minutes.', minutes: 7 },
  ],
};

const DECK_REPLY = `Here is your deck.\n\n\`\`\`yawp-slides\n${JSON.stringify(DECK)}\n\`\`\``;

/** A lesson with pieces already filed in its stack, in written order. */
async function seedStack(
  e2eContext: Ctx,
  pieces: Array<{ title: string; kind?: string; audience?: string; content?: string }>
) {
  const { conversationId, assistantIds } = await seedConversation(e2eContext, [
    { role: 'user', content: 'Plan Day 1 of The Things They Carried.' },
    { role: 'assistant', content: 'Here is the plan.' },
  ]);
  const prisma = createE2EPrismaClient();
  try {
    for (const [index, piece] of pieces.entries()) {
      await prisma.lessonPlanMaterial.create({
        data: {
          conversationId,
          sourceMessageId: assistantIds[0]!,
          sourceCreatedAt: new Date(Date.UTC(2026, 9, 12, 10, 0, 1)),
          blockKey: String(index),
          slot: `seed-${index}`,
          kind: piece.kind ?? 'notes',
          title: piece.title,
          audience: piece.audience ?? 'teacher',
          content: piece.content ?? `${piece.title} body.`,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
  return { conversationId, assistantIds };
}

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
      const filed = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );
      await page.getByTestId('deck-toggle').click();
      expect((await filed).ok()).toBe(true);
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
      const filed = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );
      await page.getByTestId('deck-toggle').click();
      expect((await filed).ok()).toBe(true);
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

  test.describe('A1, A2: the stack is a simple list you can sequence', () => {
    test('move pieces up and down; the order saves itself and the document follows', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedStack(e2eContext, [
        { title: 'Historical context' },
        { title: 'Read aloud' },
        { title: 'Exit ticket', kind: 'exit-ticket', audience: 'student' },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);

      const rows = page.getByTestId('stack-list-row');
      await expect(rows).toHaveText([/Historical context/, /Read aloud/, /Exit ticket/]);
      // A36: no filters; the stack is one simple list.
      await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveCount(0);

      const saved = () =>
        page.waitForResponse(
          (response) =>
            response.url().includes('/api/domain/lesson-planner/packet') &&
            response.request().method() === 'POST'
        );
      let save = saved();
      await page.getByRole('button', { name: 'Move Exit ticket up' }).click();
      await save;
      save = saved();
      await page.getByRole('button', { name: 'Move Exit ticket up' }).click();
      await save;
      await expect(rows).toHaveText([/Exit ticket/, /Historical context/, /Read aloud/]);

      await page.reload();
      await expect(page.getByTestId('stack-list-row')).toHaveText([
        /Exit ticket/,
        /Historical context/,
        /Read aloud/,
      ]);
      const sections = page.getByTestId('packet-section');
      await expect(sections.nth(0)).toContainText('Exit ticket body.');
      await expect(sections.nth(2)).toContainText('Read aloud body.');
    });

    test('drag a piece to a new place', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedStack(e2eContext, [
        { title: 'First' },
        { title: 'Second' },
        { title: 'Third' },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const rows = page.getByTestId('stack-list-row');
      await expect(rows).toHaveText([/First/, /Second/, /Third/]);

      const save = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );
      await rows.nth(2).dragTo(rows.nth(0));
      await save;
      await expect(rows).toHaveText([/Third/, /First/, /Second/]);
      await page.reload();
      await expect(page.getByTestId('stack-list-row')).toHaveText([/Third/, /First/, /Second/]);
    });

    test('remove a piece from the list itself, with Undo', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedStack(e2eContext, [
        { title: 'Keep me' },
        { title: 'Drop me' },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const rows = page.getByTestId('stack-list-row');

      await page.getByRole('button', { name: 'Remove Drop me from the stack' }).first().click();
      await expect(rows).toHaveText([/Keep me/]);
      await expect(page.getByTestId('packet-section')).toHaveCount(1);
      await page.getByTestId('remove-undo').getByRole('button', { name: 'Undo' }).click();
      await expect(rows).toHaveText([/Keep me/, /Drop me/]);

      await page.getByRole('button', { name: 'Remove Drop me from the stack' }).first().click();
      await expect(page.getByTestId('remove-undo')).toBeHidden({ timeout: 10_000 });
      await page.reload();
      await expect(page.getByTestId('stack-list-row')).toHaveText([/Keep me/]);
    });
  });

  test.describe('A5, A6: writing pieces become assignments; codes stay hidden', () => {
    test('a filed class starter says what it is, offers Create in Yawp!, and shows no code', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedStack(e2eContext, [
        {
          title: 'Class Starter: Write about something you carry',
          kind: 'class-starter',
          audience: 'student',
          // The footer every starter filed before run 2 carries.
          content: 'Write about something you carry every day.\n\n_Class Starter prompt FW-021_',
        },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);

      const section = page.getByTestId('packet-section');
      await expect(section).toContainText('Write about something you carry every day.');
      await expect(page.locator('body')).not.toContainText('FW-021');
      await expect(section).toContainText('Class Starter');
      const create = section.getByTestId('stack-create-assignment');
      await expect(create).toHaveText('Create this class starter in Yawp!');
      await expect(create).toHaveAttribute('href', /\/app\/assignment-types\/.+newPrompt=Write/);
    });

    test('the chat never shows a library code, in prose or in a chip', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Swap out the class starter prompt' },
        {
          role: 'assistant',
          content:
            'Two others that fit:\n\n- FW-093: "What is the heaviest thing you have ever carried?"\n- FW-024: "What do you carry that no one can see?"\n\n' +
            '```suggestions\nUse prompt FW-093 instead\n```',
        },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await expect(page.getByText('What is the heaviest thing you have ever carried?')).toBeVisible();
      await expect(page.locator('main')).not.toContainText('FW-093');
      await expect(page.locator('main')).not.toContainText('FW-024');
    });
  });

  test.describe('A8: labels, the last step, and the make-up handout', () => {
    test('"Create handouts", and the deck is the last thing built from the stack', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedStack(e2eContext, [
        { title: 'Read aloud' },
        { title: 'Class Starter: Carry', kind: 'class-starter', audience: 'student', content: 'Write about what you carry.' },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);

      await expect(page.getByRole('button', { name: 'Create handouts', exact: true })).toBeVisible();
      const strip = page.getByTestId('build-from-stack');
      await expect(strip).toContainText('When the sequence is set');
      const links = strip.getByRole('link');
      await expect(links.last()).toHaveText('Create a slide deck from this stack');
      await expect(strip.getByRole('link', { name: 'Create handouts from this stack' })).toBeVisible();
    });

    test('a stack that has a deck offers to rebuild it', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedStack(e2eContext, [
        { title: 'Read aloud' },
        {
          title: 'The Things They Carried — Day 1',
          kind: 'slides',
          content: '```yawp-slides\n' + JSON.stringify(DECK) + '\n```',
        },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const asked: string[] = [];
      await page.route('**/api/domain/lesson-planner', (route) => {
        asked.push(route.request().postData() ?? '');
      });
      await page.getByRole('link', { name: 'Rebuild the slide deck from this stack' }).click();
      await expect
        .poll(() => decodeURIComponent(asked.join('\n').replace(/\+/g, ' ')))
        .toContain('Rebuild the slide deck from my stack');
    });

    test('send the lesson to a student who missed class', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedStack(e2eContext, [
        { title: 'Class Starter: Carry', kind: 'class-starter', audience: 'student', content: 'Write about what you carry.' },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const asked: string[] = [];
      await page.route('**/api/domain/lesson-planner', (route) => {
        asked.push(route.request().postData() ?? '');
      });
      await page.getByRole('link', { name: 'Send this lesson to a student who missed class' }).click();
      await expect(page).toHaveURL(new RegExp(`c=${conversationId}`));
      await expect
        .poll(() => decodeURIComponent(asked.join('\n').replace(/\+/g, ' ')))
        .toContain('a student who was absent today');
      await expect(page).not.toHaveURL(/build=/);
    });
  });

  test.describe('B2: the plan and the deck fit the period, or say so', () => {
    async function setPeriod(conversationId: string, minutes: number) {
      const prisma = createE2EPrismaClient();
      try {
        await prisma.lessonPlanConversation.update({
          where: { id: conversationId },
          data: { periodMinutes: minutes, lessonClassLabel: 'English 11 · Period 5' },
        });
      } finally {
        await prisma.$disconnect();
      }
    }

    const LONG_PLAN =
      '# The Things They Carried — Day 1\n\n## Class starter (8 min)\n\nWrite.\n\n' +
      '## Read aloud (30 min)\n\nRead.\n\n## Pair talk (12 min)\n\nTalk.\n\n## Exit ticket (7 min)\n\nWrite.';

    test('a 57-minute plan for a 50-minute period says so, with a way to trim it', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'For English 11 · Period 5, 50 minutes.' },
        { role: 'assistant', content: LONG_PLAN },
      ]);
      await setPeriod(conversationId, 50);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      const flag = page.getByTestId('plan-over-time');
      await expect(flag).toContainText('This plan runs 57 minutes; the period is 50.');
      const asked: string[] = [];
      await page.route('**/api/domain/lesson-planner', (route) => {
        asked.push(route.request().postData() ?? '');
      });
      await flag.getByRole('button', { name: 'Trim it to 50 minutes' }).click();
      await expect
        .poll(() => decodeURIComponent(asked.join('\n').replace(/\+/g, ' ')))
        .toContain('Trim this plan to fit 50 minutes');
    });

    test('a plan that fits says nothing', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'For English 11 · Period 5, 60 minutes.' },
        { role: 'assistant', content: LONG_PLAN },
      ]);
      await setPeriod(conversationId, 60);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await expect(page.getByRole('heading', { name: /Day 1/ })).toBeVisible();
      await expect(page.getByTestId('plan-over-time')).toHaveCount(0);
    });

    test('a deck past the period is flagged on its card and in the editor', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_deck_v2', true);
      const longDeck = {
        ...DECK,
        slides: DECK.slides.map((slide) => ({ ...slide, minutes: 15 })),
      };
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Build the slide deck for this lesson' },
        {
          role: 'assistant',
          content: `Here is your deck.\n\n\`\`\`yawp-slides\n${JSON.stringify(longDeck)}\n\`\`\``,
        },
      ]);
      await setPeriod(conversationId, 50);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      const card = page.getByTestId('slide-deck-card');
      await expect(card.getByTestId('deck-over-time')).toHaveText('60 min for a 50-minute period');
      await expect(card.getByRole('button', { name: 'Fit the deck to 50 minutes' })).toBeVisible();

      // The stack's deck card says so too.
      await card.getByTestId('deck-toggle').click();
      await expect(card.getByTestId('deck-toggle')).toHaveText(/in the stack/i);
      await page.waitForLoadState('networkidle');
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await expect(page.getByTestId('slide-deck-card').getByTestId('deck-over-time')).toHaveText(
        '60 min for a 50-minute period'
      );

      await page.getByTestId('slide-deck-card').getByTestId('deck-edit').click();
      const total = page.getByTestId('deck-editor-total');
      await expect(total).toHaveText('60 of 50 min');
      await page.getByRole('button', { name: /^Slide 2:/ }).click();
      await page.getByLabel('Minutes', { exact: true }).fill('5');
      await expect(total).toHaveText('50 of 50 min');
    });
  });

  test.describe('E1: swap the class starter', () => {
    const STARTER_REPLY =
      '## Class starter (5 min)\n\n```yawp-daily-pages\nkind: class-starter\nid: FW-021\nWrite about something you carry every day.\n```';
    const SWAP_REPLY =
      'Two others that fit:\n\n```yawp-daily-pages\nkind: class-starter\nid: FW-093\nWhat is the heaviest thing you have ever carried?\n```\n\n' +
      '```yawp-daily-pages\nkind: class-starter\nid: FW-024\nWhat do you carry that no one can see?\n```';

    test('a starter offers the swap; the swap shows three choices; "replace" swaps it in the stack', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan Day 1 of The Things They Carried.' },
        { role: 'assistant', content: STARTER_REPLY },
        { role: 'user', content: 'Swap out the class starter prompt' },
        { role: 'assistant', content: SWAP_REPLY },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);

      const cards = page.getByTestId('daily-pages-card');
      await expect(cards).toHaveCount(3);
      // The original starter: the normal two choices.
      await expect(cards.nth(0).getByTestId('daily-pages-replace')).toHaveCount(0);
      const filed = () =>
        page.waitForResponse(
          (response) =>
            response.url().includes('/api/domain/lesson-planner/packet') &&
            response.request().method() === 'POST'
        );
      let done = filed();
      await cards.nth(0).getByTestId('daily-pages-stack-toggle').click();
      await done;

      // Each swap option: Add to stack, Replace, Create.
      const second = cards.nth(2);
      await expect(second.getByTestId('daily-pages-stack-toggle')).toHaveText(/add to stack/i);
      await expect(second.getByTestId('daily-pages-replace')).toHaveText(
        'Replace existing class starter with this one'
      );
      await expect(second.getByTestId('daily-pages-create')).toHaveText(/Create class starter assignment/);
      await expect(page.locator('main')).not.toContainText('FW-0');

      done = filed();
      await second.getByTestId('daily-pages-replace').click();
      await done;
      await expect(second.getByTestId('daily-pages-stack-toggle')).toHaveText(/in the stack/i);
      await expect(cards.nth(0).getByTestId('daily-pages-stack-toggle')).toHaveText(/add to stack/i);

      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await expect(page.getByTestId('stack-list-row')).toHaveCount(1);
      await expect(page.getByTestId('packet-section')).toContainText('What do you carry that no one can see?');
    });

    test('the swap chip sits under a class starter', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan Day 1 of The Things They Carried.' },
        { role: 'assistant', content: STARTER_REPLY },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await expect(page.getByRole('button', { name: 'Swap out the class starter prompt' })).toBeVisible();
    });
  });

  test.describe('A3, A4, E3: every step is a piece; add everything, then refine', () => {
    const PLAN_WITH_FRAMINGS = [
      '# The Things They Carried — Day 1',
      '',
      '## Framing (5 min)',
      '',
      'Pick a framing.',
      '',
      '```yawp-material',
      'kind: notes',
      'slot: frame-hist',
      'title: Historical context',
      '---',
      'Vietnam, 1969.',
      '```',
      '',
      '```yawp-material',
      'kind: notes',
      'slot: frame-lit',
      'title: Literary context',
      '---',
      'Metafiction.',
      '```',
      '',
      '## Read aloud (20 min)',
      '',
      'If you like reading aloud yourself, take the first pages.',
      '',
      '## Pair talk (8 min)',
      '',
      'Pairs compare one thing they carry.',
    ].join('\n');

    const saved = (page: import('@playwright/test').Page) =>
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );

    test('a reading step goes in the stack on its own', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan Day 1.' },
        { role: 'assistant', content: PLAN_WITH_FRAMINGS },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);

      const steps = page.getByTestId('plan-step');
      await expect(steps).toHaveText([/Framing/, /Read aloud/, /Pair talk/]);
      const done = saved(page);
      await steps.nth(1).getByTestId('plan-step-toggle').click();
      expect((await done).ok()).toBe(true);
      await expect(steps.nth(1).getByTestId('plan-step-toggle')).toHaveText(/in the stack/i);

      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await expect(page.getByTestId('stack-list-row')).toHaveText([/Read aloud/]);
      await expect(page.getByTestId('packet-section')).toContainText('Lesson step');
      await expect(page.getByTestId('packet-section')).toContainText('If you like reading aloud yourself');
    });

    test('Add everything files each step and framing as its own piece, in order', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan Day 1.' },
        { role: 'assistant', content: PLAN_WITH_FRAMINGS },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);

      const done = saved(page);
      await page.getByRole('button', { name: 'Add everything to the stack' }).click();
      expect((await done).ok()).toBe(true);
      await expect(page.getByText('Everything is in the stack')).toBeVisible();

      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await expect(page.getByTestId('stack-list-row')).toHaveText([
        /Framing/,
        /Historical context/,
        /Literary context/,
        /Read aloud/,
        /Pair talk/,
      ]);
      // Each one can go on its own.
      await page
        .getByTestId('stack-list')
        .getByRole('button', { name: 'Remove Literary context from the stack' })
        .click();
      await expect(page.getByTestId('stack-list-row')).toHaveCount(4);
    });

    test('a lesson kept whole the old way can be split into its pieces', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId, assistantIds } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan Day 1.' },
        { role: 'assistant', content: PLAN_WITH_FRAMINGS },
      ]);
      const prisma = createE2EPrismaClient();
      await prisma.lessonPlanMessage.update({
        where: { id: assistantIds[0]! },
        data: { keptAt: new Date(), keptAudience: 'teacher' },
      });
      await prisma.$disconnect();
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await expect(page.getByTestId('stack-list-row')).toHaveCount(1);

      const done = saved(page);
      await page.getByTestId('section-split').click();
      expect((await done).ok()).toBe(true);
      await expect(page.getByTestId('stack-list-row')).toHaveText([
        /Framing/,
        /Historical context/,
        /Literary context/,
        /Read aloud/,
        /Pair talk/,
      ]);
    });
  });

  test('A3: writing practice goes in the stack too', async ({ page, signIn, e2eContext }) => {
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
    const { conversationId } = await seedConversation(e2eContext, [
      { role: 'user', content: 'Plan a comma splice lesson.' },
      {
        role: 'assistant',
        content:
          '## Practice (10 min)\n\nFix a few.\n\n```yawp-practice\nlessons: fixing-comma-splices\nproblems: 6\ntitle: Comma splice repair\n---\nFix each sentence.\n```',
      },
    ]);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    const toggle = page.getByTestId('practice-card').getByTestId('practice-stack-toggle');
    const filed = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/lesson-planner/packet') &&
        response.request().method() === 'POST'
    );
    await toggle.click();
    expect((await filed).ok()).toBe(true);
    await expect(toggle).toHaveText(/in the stack/i);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await expect(page.getByTestId('stack-list-row')).toHaveText([/Writing practice: Comma splice repair/]);
    await expect(page.getByTestId('packet-section')).toContainText('6 problems');
  });

  test.describe('C2, C3, C4: the deck, subtle and editable on the slide', () => {
    test('no minutes on the slides; a raised tile and no orange band on the class starter', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_deck_v2', true);
      const { conversationId, assistantIds } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Build the slide deck for this lesson' },
        { role: 'assistant', content: DECK_REPLY },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/present/${conversationId}/${assistantIds[0]}`);
      const stage = page.getByTestId('slide-stage');
      await expect(stage).toContainText('TODAY');
      await expect(stage).not.toContainText('MIN');
      await page.waitForLoadState('networkidle');
      await page.keyboard.press('ArrowRight');
      await expect(stage).toContainText('YOUR TURN');
      await expect(stage).not.toContainText('8 MIN');
      const card = stage.getByTestId('tile-card');
      await expect(card).toHaveCSS('border-top-width', '1px');
      // The speaker notes still say how long.
      await page.getByRole('button', { name: 'Notes' }).click();
      await expect(page.locator('body')).toContainText('8 min');
    });

    test('edit the words on the slide; the form below follows, and the other way round', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_deck_v2', true);
      const { conversationId, assistantIds } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Build the slide deck for this lesson' },
        { role: 'assistant', content: DECK_REPLY },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner/${conversationId}/deck/${assistantIds[0]}`);
      await page.getByRole('button', { name: /^Slide 2:/ }).click();

      const onSlide = page.getByRole('textbox', { name: 'Slide title' });
      await onSlide.click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('What you carry');
      await expect(page.getByLabel('Title', { exact: true })).toHaveValue('What you carry');

      await page
        .getByRole('textbox', { name: 'Text', exact: true })
        .fill('Write about one thing in your bag.');
      await expect(page.getByRole('textbox', { name: 'Slide text' })).toHaveText(
        'Write about one thing in your bag.'
      );

      await page.getByTestId('deck-editor-save').click();
      await expect(page).toHaveURL(new RegExp(`/app/lesson-planner\\?c=${conversationId}`));
      await page.getByTestId('slide-deck-card').getByRole('link', { name: 'Present' }).click();
      await expect(page.getByTestId('slide-counter')).toHaveText('1 / 4');
      // The button, not the arrow key: a key pressed before the presenter has
      // hydrated is lost.
      await page.getByRole('button', { name: 'Next slide' }).click();
      await expect(page.getByTestId('slide-counter')).toHaveText('2 / 4');
      await expect(page.getByTestId('slide-stage')).toContainText('What you carry');
      await expect(page.getByTestId('slide-stage')).toContainText('Write about one thing in your bag.');
    });
  });

  test.describe('D1, D2: a concise lesson plan, for Word and Google Docs', () => {
    test('downloads a Word file and a short PDF of the plan from the stack', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      await setLessonPlannerReviewFlag('lesson_planner_plan_export_v2', true);
      const { conversationId } = await seedStack(e2eContext, [
        { title: 'Class Starter: Carry', kind: 'class-starter', audience: 'student', content: 'Write about what you carry.' },
        { title: 'Read aloud (20 min)', kind: 'step', content: 'If you like reading aloud yourself, take the first pages.' },
        { title: 'Exit ticket', kind: 'exit-ticket', audience: 'student', content: 'What weighed nothing?' },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);

      const word = page.getByRole('link', { name: 'Lesson plan for Word / Google Docs' }).first();
      await expect(word).toBeVisible();
      await expect(page.getByText('In Google Docs: File, then Open, then Upload.')).toBeVisible();
      const [docx] = await Promise.all([page.waitForEvent('download'), word.click()]);
      expect(docx.suggestedFilename()).toMatch(/Lesson plan\.docx$/);
      const bytes = await (await import('node:fs/promises')).readFile((await docx.path())!);
      expect(bytes.subarray(0, 2).toString()).toBe('PK');

      const response = await page.request.get(`/app/lesson-planner/${conversationId}/plan.pdf`);
      expect(response.ok()).toBe(true);
      expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
      // The full packet is still there for whoever wants everything.
      await expect(page.getByRole('link', { name: 'Full packet (PDF)' })).toBeVisible();
    });

    test('flag off: no Word download, and the route is not there', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedStack(e2eContext, [{ title: 'Read aloud' }]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await expect(page.getByRole('link', { name: 'Lesson plan for Word / Google Docs' })).toHaveCount(0);
      const response = await page.request.get(`/app/lesson-planner/${conversationId}/plan.docx`);
      expect(response.status()).toBe(404);
    });
  });

  test.describe('A7: the stack takes shape beside the chat', () => {
    const TWO_STARTERS =
      '## Class starter (5 min)\n\n```yawp-daily-pages\nkind: class-starter\nWrite about something you carry every day.\n```\n\n' +
      '```yawp-daily-pages\nkind: class-starter\nWhat is the heaviest thing you have carried?\n```';

    test('flag off: no panel', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan Day 1.' },
        { role: 'assistant', content: TWO_STARTERS },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await page.getByTestId('daily-pages-stack-toggle').first().click();
      await expect(page.getByTestId('lesson-packet-bar')).toBeVisible();
      await expect(page.getByTestId('stack-panel')).toHaveCount(0);
    });

    test('pieces appear as they are added; remove and reorder right there', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      await setLessonPlannerReviewFlag('lesson_planner_stack_panel', true);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan Day 1.' },
        { role: 'assistant', content: TWO_STARTERS },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await expect(page.getByTestId('stack-panel')).toHaveCount(0);

      const toggles = page.getByTestId('daily-pages-stack-toggle');
      await toggles.nth(0).click();
      const panel = page.getByTestId('stack-panel');
      await expect(panel).toBeVisible();
      await expect(panel.getByTestId('stack-list-row')).toHaveText([/something you carry/]);
      await toggles.nth(1).click();
      await expect(panel.getByTestId('stack-list-row')).toHaveText([
        /something you carry/,
        /heaviest thing/,
      ]);

      // Reorder in the panel.
      const reordered = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );
      await panel.getByRole('button', { name: /^Move Class Starter: What is the heaviest.* up$/ }).click();
      await reordered;
      await expect(panel.getByTestId('stack-list-row')).toHaveText([
        /heaviest thing/,
        /something you carry/,
      ]);

      // Remove in the panel: the chat card goes back to "Add to stack".
      await panel.getByRole('button', { name: /^Remove Class Starter: Write about/ }).click();
      await expect(panel.getByTestId('stack-list-row')).toHaveText([/heaviest thing/]);
      await expect(page.getByTestId('remove-undo')).toBeHidden({ timeout: 10_000 });
      await expect(toggles.nth(0)).toHaveText(/add to stack/i);

      // The full stack is one click away, in the order set here.
      await panel.getByRole('link', { name: 'Open the full stack' }).click();
      await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/packet`));
      await expect(page.getByTestId('stack-list-row')).toHaveText([/heaviest thing/]);
    });

    test('closed, it stays closed until opened again', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      await setLessonPlannerReviewFlag('lesson_planner_stack_panel', true);
      const { conversationId } = await seedStack(e2eContext, [{ title: 'Read aloud' }]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      const panel = page.getByTestId('stack-panel');
      await expect(panel.getByTestId('stack-list-row')).toHaveText([/Read aloud/]);
      await panel.getByRole('button', { name: 'Close the stack panel' }).click();
      await expect(panel).toHaveCount(0);
      await page.reload();
      await expect(page.getByTestId('stack-panel')).toHaveCount(0);
      await page.getByRole('button', { name: 'Show the stack here' }).click();
      await expect(page.getByTestId('stack-panel')).toBeVisible();
    });
  });
});
