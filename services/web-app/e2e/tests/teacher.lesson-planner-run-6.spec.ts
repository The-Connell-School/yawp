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
  'lesson_planner_stack_panel',
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

async function seedIds(conversationId: string) {
  const prisma = createE2EPrismaClient();
  try {
    const rows = await prisma.lessonPlanMessage.findMany({
      where: { conversationId, role: 'assistant' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  } finally {
    await prisma.$disconnect();
  }
}

async function fileDeck(page: import('@playwright/test').Page, conversationId: string, messageId: string) {
  const filed = await page.request.post('/api/domain/lesson-planner/packet', {
    form: { intent: 'add-material', conversationId, messageId, materialKey: 'deck' },
  });
  expect(filed.ok()).toBe(true);
}

/**
 * The planner's turn, stubbed: it saves the stack's two messages as the
 * server would, and answers with the stream's last line.
 */
async function stubStackDeckTurn(page: import('@playwright/test').Page, conversationId: string, asked: string[]) {
  await page.route('**/api/domain/lesson-planner', async (route) => {
    const form = new URLSearchParams(route.request().postData() ?? '');
    asked.push(`${form.get('surface')}|${form.get('message')}`);
    const prisma = createE2EPrismaClient();
    let messageId = '';
    try {
      const now = Date.now();
      await prisma.lessonPlanMessage.create({
        data: { conversationId, role: 'user', content: form.get('message') ?? '', surface: 'stack', createdAt: new Date(now) },
      });
      const reply = await prisma.lessonPlanMessage.create({
        data: { conversationId, role: 'assistant', content: DECK_REPLY, surface: 'stack', createdAt: new Date(now + 1) },
        select: { id: true },
      });
      messageId = reply.id;
    } finally {
      await prisma.$disconnect();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: [
        JSON.stringify({ type: 'progress', label: 'Writing the slides', fraction: 0.6 }),
        JSON.stringify({ type: 'done', status: 200, payload: { conversationId, messageId, reply: DECK_REPLY } }),
        '',
      ].join('\n'),
    });
  });
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

  test.describe('item 2: the deck is built right in the stack', () => {
    test('asked for in Ask the planner, it comes back as a card to preview and add', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Day one of The Things They Carried, English 11, 50 minutes.' },
        { role: 'assistant', content: DAY_ONE_REPLY },
      ]);
      const kept = await page.request.post('/api/domain/lesson-planner/packet', {
        form: { intent: 'keep-all', conversationId, messageId: (await seedIds(conversationId))[0]! },
      });
      expect(kept.ok()).toBe(true);
      const asked: string[] = [];
      await stubStackDeckTurn(page, conversationId, asked);

      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Ask the planner' }).first().click();
      await page.getByTestId('stack-ask-input').fill('Build the slide deck');
      await page.getByRole('button', { name: 'Send' }).click();

      const deck = page.getByTestId('stack-deck');
      await expect(deck).toContainText('The Things They Carried — Day 1');
      expect(asked).toEqual(['stack|Build the slide deck from my stack']);
      // Never sent to the chat.
      await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/packet$`));
      await expect(deck.getByRole('link', { name: /present/i })).toHaveAttribute(
        'href',
        new RegExp(`/present/${conversationId}/[^?]+\\?from=stack$`)
      );

      await deck.getByTestId('deck-toggle').click();
      await expect(deck.getByTestId('deck-toggle')).toContainText('In your lesson');
      await expect(page.getByTestId('take-to-class')).toContainText('4 slides from your stack');

      // The chat shows it as one compact line.
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await expect(page.getByTestId('stack-turn').last()).toContainText('Deck built in your lesson');
    });

    test('"Build the deck" and "Rebuild" build it in the stack, and a new deck replaces the old', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Day one of The Things They Carried, English 11, 50 minutes.' },
        { role: 'assistant', content: DAY_ONE_REPLY },
      ]);
      const kept = await page.request.post('/api/domain/lesson-planner/packet', {
        form: { intent: 'keep-all', conversationId, messageId: (await seedIds(conversationId))[0]! },
      });
      expect(kept.ok()).toBe(true);
      const asked: string[] = [];
      await stubStackDeckTurn(page, conversationId, asked);

      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await page.waitForLoadState('networkidle');
      await page.getByTestId('build-deck').click();
      await expect(page.getByTestId('add-panel')).toBeVisible();
      const first = page.getByTestId('stack-deck').first();
      await expect(first).toBeVisible();
      await first.getByTestId('deck-toggle').click();
      await expect(page.getByTestId('take-to-class')).toContainText('4 slides from your stack');

      await page.getByRole('button', { name: 'Close' }).click();
      await page.getByTestId('rebuild-deck').click();
      const second = page.getByTestId('stack-deck').nth(1);
      await expect(second).toBeVisible();
      await expect(second.getByTestId('stack-deck-replaces')).toHaveText('Adding it replaces the deck in your lesson.');
      await second.getByTestId('deck-toggle').click();
      await expect(second.getByTestId('deck-toggle')).toContainText('In your lesson');
      await expect(page.getByTestId('stack-deck').first().getByTestId('deck-toggle')).toContainText('Add to lesson');
      expect(asked).toEqual([
        'stack|Build the slide deck from my stack',
        'stack|Rebuild the slide deck from my stack, replacing the one in it',
      ]);
      await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/packet$`));
    });

    test('round 2: the deck card previews every slide in place, and Hide closes it', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Day one of The Things They Carried, English 11, 50 minutes.' },
        { role: 'assistant', content: DAY_ONE_REPLY },
      ]);
      const asked: string[] = [];
      await stubStackDeckTurn(page, conversationId, asked);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Ask the planner' }).first().click();
      await page.getByTestId('stack-ask-input').fill('make slides for this lesson');
      await page.getByRole('button', { name: 'Send' }).click();

      const deck = page.getByTestId('stack-deck');
      const toggle = deck.getByTestId('stack-deck-preview-toggle');
      await expect(toggle).toHaveText('Preview');
      await toggle.click();
      const preview = deck.getByTestId('stack-deck-preview');
      await expect(preview.getByTestId('stack-deck-preview-slide')).toHaveCount(4);
      await expect(preview).toContainText('Hold this question');
      await expect(preview).toContainText('Why does a list feel like the right form?');
      await expect(toggle).toHaveText('Hide');
      await toggle.click();
      await expect(preview).toHaveCount(0);
    });

    test('round 2: a deck made in the chat but never added is offered in the stack', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedStackWithDeckReply(page, e2eContext);
      const asked: string[] = [];
      await page.route('**/api/domain/lesson-planner', (route) => {
        asked.push(route.request().postData() ?? '');
        return route.abort();
      });
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await page.waitForLoadState('networkidle');
      const takeToClass = page.getByTestId('take-to-class');
      await expect(takeToClass).toContainText('The planner already made a deck in your conversation');
      // Add it adds it, with no detour through the sidebar (Brian's round 5, item 6).
      await takeToClass.getByTestId('add-conversation-deck').click();
      await expect(takeToClass).toContainText('4 slides from your stack');
      await expect(page.getByTestId('add-panel')).toHaveCount(0);
      // Added as it was: nothing was rebuilt.
      expect(asked).toEqual([]);
    });
  });

  test.describe("Kevin's notes (Oct 24)", () => {
    test("a piece in the chat's stack panel opens on the stack page", async ({ page, signIn, e2eContext }) => {
      for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedStackWithDeckReply(page, e2eContext);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await page.waitForLoadState('networkidle');
      const panel = page.getByTestId('stack-panel');
      await expect(panel).toBeVisible();
      // The second piece, so it is not the one that happens to be first.
      await panel.getByRole('button', { name: /Hook activity/i }).first().click();
      await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/packet\\?open=`));
      const open = page.locator('[data-testid="run-card"][data-open="true"]');
      await expect(open).toHaveCount(1);
      await expect(open.getByTestId('run-card-title')).toContainText('Hook activity');
    });

    test('a deck built on the stack is one click away from the chat and the stack, added or not', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Day one of The Things They Carried, English 11, 50 minutes.' },
        { role: 'assistant', content: DAY_ONE_REPLY },
      ]);
      const kept = await page.request.post('/api/domain/lesson-planner/packet', {
        form: { intent: 'keep-all', conversationId, messageId: (await seedIds(conversationId))[0]! },
      });
      expect(kept.ok()).toBe(true);
      const asked: string[] = [];
      await stubStackDeckTurn(page, conversationId, asked);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await page.waitForLoadState('networkidle');
      await page.getByTestId('build-deck').click();
      await expect(page.getByTestId('stack-deck')).toBeVisible();

      // Back to the planner without adding it: the deck is right there.
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      const card = page.getByTestId('slide-deck-card').last();
      await expect(card).toContainText('The Things They Carried — Day 1');
      await card.getByRole('link', { name: /present/i }).click();
      await expect(page.getByTestId('slide-counter')).toHaveText('1 / 4');
      await page.getByTestId('present-close').click();
      await expect(page).toHaveURL(new RegExp(`/app/lesson-planner\\?c=${conversationId}$`));

      // And on the stack, Take it to class offers it rather than another build.
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const takeToClass = page.getByTestId('take-to-class');
      await expect(takeToClass).toContainText('You built a deck here');
      await expect(takeToClass.getByTestId('built-deck-present')).toHaveAttribute(
        'href',
        new RegExp(`/present/${conversationId}/[^?]+\\?from=stack$`)
      );
      // Add it adds it right there (Brian's round 5, item 6).
      await takeToClass.getByTestId('add-conversation-deck').click();
      await expect(takeToClass.getByTestId('add-conversation-deck')).toHaveCount(0);
      await expect(page.getByTestId('add-panel')).toHaveCount(0);
      expect(asked).toHaveLength(1);
    });
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
