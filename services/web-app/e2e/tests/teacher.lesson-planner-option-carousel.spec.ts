/**
 * Options in the Lesson Planner chat page through one at a time (Kevin, Nov 21).
 *
 * Three class starters (or exit tickets) offered for one step used to sit in a
 * three-column grid. At desktop width each column was narrower than its green
 * "Create this Class Starter exercise for your class" button, so the label was
 * cut off on both sides. Now the options sit in a scroll-snapping row: one
 * card mostly in view, a peek of the next, arrows to page, and every button
 * wraps its label instead of running past the card.
 *
 * Every reply is seeded: the model is never called.
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setFeatureFlag, setLessonPlannerReviewFlag } from '../feature-flags';

const TEACHER_PASSWORD = 'teacher-e2e-password';

type Ctx = { teacherMembershipId: string; organizationId: string };
type Turn = { role: 'user' | 'assistant'; content: string };

async function seedConversation(e2eContext: Ctx, turns: Turn[]) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Hemingway, day one',
        periodMinutes: 50,
        lessonClassLabel: 'English 10 · Period 3',
        messages: {
          create: turns.map((turn, index) => ({
            ...turn,
            createdAt: new Date(Date.UTC(2026, 10, 21, 10, 0, index)),
          })),
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

const starter = (text: string) => '```yawp-daily-pages\nkind: class-starter\n' + text + '\n```';
const STARTERS_REPLY = [
  '# Day One',
  '## Class starter (5 min)',
  'While everyone settles, students write to one of the three prompts below.',
  'Pick one:',
  starter('Think of a conversation where the real issue was never actually named.'),
  starter('Describe a time someone said one thing and meant another.'),
  starter('What do people avoid saying out loud?'),
  '## Mini-lesson: the iceberg (15 min)',
  'Teach the iceberg theory with the opening of "Hills Like White Elephants".',
].join('\n\n');

const ticket = (lines: string[]) => '```yawp-exit-ticket\n' + lines.join('\n') + '\n```';
const TICKETS_REPLY = [
  '# Catcher, chapters 1–4',
  '## Discussion: Holden’s voice (20 min)',
  'Pairs find two lines where Holden says one thing and means another.',
  '## Closing (5 min) {type: closing}',
  'Bring it back to the hat. Then one ticket, whichever fits:',
  ticket(['activity: reflect', 'starter: wondering', 'promptText: What is one question you still have about today’s lesson?']),
  ticket(['activity: answer-question', 'promptText: Who is Allie, and why does Holden keep thinking about him?']),
  ticket(['activity: engage-text', 'promptText: Reread the second stanza. Find two examples of enjambment.']),
].join('\n\n');

const WIDTHS = [360, 390, 768, 1024, 1280, 1440, 1600];

/** The scroll container's box against each option's box. */
async function optionsInView(row: Locator) {
  return row.getByTestId('option-row-track').evaluate((track) => {
    const box = track.getBoundingClientRect();
    return Array.from(track.querySelectorAll<HTMLElement>('[data-testid="option-row-item"]')).map((item) => {
      const rect = item.getBoundingClientRect();
      const visible = Math.max(0, Math.min(rect.right, box.right) - Math.max(rect.left, box.left));
      return {
        full: rect.left >= box.left - 1 && rect.right <= box.right + 1,
        share: rect.width ? visible / rect.width : 0,
        widthOfRow: rect.width / box.width,
      };
    });
  });
}

/**
 * Nothing in a card is cut off: no button or link holds more text than it
 * shows, and nothing a teacher reads or clicks runs past the card's edges.
 */
async function clippedInCards(row: Locator) {
  return row.getByTestId('option-row-item').evaluateAll((items) =>
    items.flatMap((item, index) => {
      const card = (item.firstElementChild as HTMLElement | null) ?? item;
      const edge = card.getBoundingClientRect();
      const problems: string[] = [];
      card.querySelectorAll<HTMLElement>('button, a, blockquote, p').forEach((el) => {
        if (el.closest('.sr-only')) return;
        const rect = el.getBoundingClientRect();
        if (!rect.width) return;
        const label = `option ${index + 1} ${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}"`;
        if (el.scrollWidth > el.clientWidth + 1) problems.push(`${label}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
        if (rect.left < edge.left - 1 || rect.right > edge.right + 1) problems.push(`${label}: runs past the card`);
      });
      return problems;
    })
  );
}

async function openChat(page: Page, signIn: (email: string, password: string) => Promise<void>, email: string, conversationId: string) {
  await signIn(email, TEACHER_PASSWORD);
  await page.goto(`/app/lesson-planner?c=${conversationId}`);
  await page.waitForLoadState('networkidle');
}

test.describe('Lesson Planner — options page through one at a time (Kevin, Nov 21)', () => {
  test.afterEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanConversation.deleteMany({ where: { membershipId: e2eContext.teacherMembershipId } });
    } finally {
      await prisma.$disconnect();
    }
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', false);
    await setFeatureFlag('exit-ticket-builder-v3', false);
  });

  test('three class starters: one card in view, a peek of the next, arrows page through', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
    const { conversationId } = await seedConversation(e2eContext, [
      { role: 'user', content: 'Hemingway, day one, 50 minutes.' },
      { role: 'assistant', content: STARTERS_REPLY },
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openChat(page, signIn, e2eContext.teacherEmail, conversationId);

    const step = page.getByTestId('plan-segment').filter({ hasText: 'Class starter' });
    await expect(step.getByTestId('segment-choice')).toHaveText('Pick one below to add it');
    const row = page.getByTestId('option-row');
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('daily-pages-card')).toHaveCount(3);
    await expect(row.getByTestId('daily-pages-create').first()).toHaveText(
      'Create this Class Starter exercise for your class'
    );

    // One card mostly in view, and enough of the next to show there is more.
    let seen = await optionsInView(row);
    expect(seen.filter((option) => option.full)).toHaveLength(1);
    expect(seen[0]!.full).toBe(true);
    expect(seen[0]!.widthOfRow).toBeGreaterThan(0.75);
    expect(seen[0]!.widthOfRow).toBeLessThan(0.92);
    expect(seen[1]!.share).toBeGreaterThan(0);
    await expect(row.getByTestId('option-row-position')).toHaveText('1 of 3');

    // The arrows are real buttons with names; back is off on the first card.
    const previous = row.getByRole('button', { name: 'Previous option' });
    const next = row.getByRole('button', { name: 'Next option' });
    await expect(previous).toBeDisabled();
    await next.click();
    await expect(row.getByTestId('option-row-position')).toHaveText('2 of 3');
    await expect.poll(async () => (await optionsInView(row))[1]!.full).toBe(true);
    seen = await optionsInView(row);
    expect(seen.filter((option) => option.full)).toHaveLength(1);
    await expect(previous).toBeEnabled();

    await next.click();
    await expect(row.getByTestId('option-row-position')).toHaveText('3 of 3');
    await expect.poll(async () => (await optionsInView(row))[2]!.full).toBe(true);
    await expect(next).toBeDisabled();

    // A swipe or a trackpad scroll moves the count too, not only the arrows.
    await row.getByTestId('option-row-track').evaluate((track) => track.scrollTo({ left: 0 }));
    await expect(row.getByTestId('option-row-position')).toHaveText('1 of 3');

    // Each card keeps its own buttons, and none is cut off.
    await expect(row.getByTestId('daily-pages-stack-toggle')).toHaveCount(3);
    expect(await clippedInCards(row)).toEqual([]);
  });

  test('no clipped text in a class starter card from 360px to 1600px', async ({ page, signIn, e2eContext }) => {
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
    const { conversationId } = await seedConversation(e2eContext, [
      { role: 'user', content: 'Hemingway, day one, 50 minutes.' },
      { role: 'assistant', content: STARTERS_REPLY },
    ]);
    await openChat(page, signIn, e2eContext.teacherEmail, conversationId);
    const row = page.getByTestId('option-row');
    await expect(row.getByTestId('daily-pages-stack-toggle')).toHaveCount(3);
    // "In your lesson" is a different label; it must fit as well.
    await row.getByTestId('daily-pages-stack-toggle').first().click();
    await expect(row.getByTestId('daily-pages-stack-toggle').first()).toHaveText(/in your lesson/i);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => clippedInCards(row), { message: `${width}px` }).toEqual([]);
      const seen = await optionsInView(row);
      expect(seen.filter((option) => option.full), `${width}px`).toHaveLength(1);
    }
  });

  test('no clipped text in an exit ticket card from 360px to 1600px', async ({ page, signIn, e2eContext }) => {
    await setFeatureFlag('exit-ticket-builder-v3', true);
    const { conversationId } = await seedConversation(e2eContext, [
      { role: 'user', content: 'Catcher in the Rye, chapters 1–4, English 11, 50 minutes.' },
      { role: 'assistant', content: TICKETS_REPLY },
    ]);
    await openChat(page, signIn, e2eContext.teacherEmail, conversationId);
    const row = page.getByTestId('option-row');
    await expect(row.getByTestId('exit-ticket-card')).toHaveCount(3);
    await expect(row.getByTestId('exit-ticket-create')).toHaveCount(3);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => clippedInCards(row), { message: `${width}px` }).toEqual([]);
      const seen = await optionsInView(row);
      expect(seen.filter((option) => option.full), `${width}px`).toHaveLength(1);
    }
  });
});
