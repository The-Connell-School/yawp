/**
 * Brian's round 5 notes, Oct 26 (docs/plans/2026-10-26-brian-round-5.md), on a
 * Day 2 Common Sense lesson for English 10 · Period 3. Each test ends on what
 * the note's "Verify" line asks for.
 *
 * Every lesson is seeded: the model is never called.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_stack_v2',
  'lesson_planner_stack_v3',
  'lesson_planner_teach_notes',
  'lesson_planner_library_v2',
  'lesson_planner_share',
  'lesson_planner_deck_v2',
];
const SHOTS = process.env.ROUND5_SHOTS_DIR;

type Ctx = { teacherMembershipId: string; organizationId: string };

const AT = new Date(Date.UTC(2026, 9, 25, 14));
const minutes = (n: number) => new Date(AT.getTime() + n * 60_000);

const DECK = {
  title: 'Common Sense',
  slides: [
    { layout: 'title', title: 'Common Sense', speakerNotes: 'Settle in.' },
    { layout: 'big_idea', title: 'A necessary evil', body: 'Government, even in its best state, is but a necessary evil.', speakerNotes: 'Read it twice.' },
  ],
};

const EXIT_TICKET = [
  '```yawp-exit-ticket',
  'kind: check',
  'focus: explain-concept',
  'topic: the single most effective rhetorical move in Common Sense',
  'answer: subjective',
  '```',
].join('\n');

/** Brian's Day 2, in a unit with a Day 1 and a draft Day 3. */
async function seedCommonSense(ctx: Ctx, { set = true, madeInYawp = true, deckInChat = false } = {}) {
  const prisma = createE2EPrismaClient();
  try {
    const unit = await prisma.lessonPlanUnit.create({
      data: { membershipId: ctx.teacherMembershipId, organizationId: ctx.organizationId, title: 'The Revolution in Print' },
    });
    const pieces = [
      { kind: 'step', title: 'Reading Annotation — Common Sense', minutes: 1, stepType: 'read_aloud', content: 'Take out your copy of Common Sense.' },
      { kind: 'class-starter', title: 'When rules stop making sense', minutes: 5, audience: 'student', content: 'Think of a rule — at school, at home, anywhere — that you followed even though it seemed arbitrary or unfair. What kept you following it? What would it take to stop?', made: true },
      { kind: 'step', title: 'Whole-Class Discussion', minutes: 28, stepType: 'activity', label: 'Class Discussion', content: 'Two rounds. What is Paine actually arguing?' },
      { kind: 'exit-ticket', title: 'the single most effective rhetorical move in Common Sense', minutes: 5, audience: 'student', content: EXIT_TICKET, made: true },
    ];
    const day = (unitDay: number, title: string, extra: Record<string, unknown> = {}) =>
      prisma.lessonPlanConversation.create({
        data: {
          membershipId: ctx.teacherMembershipId,
          organizationId: ctx.organizationId,
          title,
          unitId: unit.id,
          unitDay,
          periodMinutes: 50,
          lessonClassLabel: 'English 10 · Period 3',
          createdAt: AT,
          ...extra,
        },
        select: { id: true },
      });
    await day(1, 'Day 1: Who was Thomas Paine?', { setAt: AT });
    const lesson = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: ctx.teacherMembershipId,
        organizationId: ctx.organizationId,
        title: 'Day 2: Common Sense',
        unitId: unit.id,
        unitDay: 2,
        periodMinutes: 50,
        lessonClassLabel: 'English 10 · Period 3',
        lessonDate: new Date('2026-10-27T12:00:00Z'),
        createdAt: AT,
        setAt: set ? new Date(AT.getTime() + 24 * 60 * 60_000 + 60_000) : null,
        materials: {
          create: pieces.map((piece, index) => ({
            sourceMessageId: 'seed',
            sourceCreatedAt: minutes(index),
            createdAt: minutes(index * 5),
            blockKey: `b${index}`,
            slot: `s${index}`,
            kind: piece.kind,
            title: piece.title,
            audience: piece.audience ?? 'teacher',
            content: piece.content,
            minutes: piece.minutes,
            stepType: piece.stepType ?? null,
            label: piece.label ?? null,
            ...(madeInYawp && piece.made ? { yawpHref: '/app/assignment-types/x', yawpCreatedAt: minutes(19) } : {}),
          })),
        },
        messages: {
          create: [0, 4, 8, 12, 16, 20].map((at, index) => ({
            role: index % 2 ? 'assistant' : 'user',
            content: index === 5 && deckInChat ? 'Here is your deck.\n\n```yawp-slides\n' + JSON.stringify(DECK) + '\n```' : `Turn ${index}`,
            createdAt: minutes(at),
          })),
        },
      },
      select: { id: true },
    });
    await day(3, 'Day 3: Writing back to Paine');
    return { unitId: unit.id, conversationId: lesson.id };
  } finally {
    await prisma.$disconnect();
  }
}

async function backgroundOf(locator: import('@playwright/test').Locator) {
  return locator.evaluate((element) => getComputedStyle(element).backgroundColor);
}

function rgb(color: string): number[] {
  return (color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
}

test.describe("Brian's round 5 (Oct 26)", () => {
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

  test('1. every tile and row in the library is white on the cream page', async ({ page, signIn, e2eContext }) => {
    await seedCommonSense(e2eContext);
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanConversation.create({
        data: { membershipId: e2eContext.teacherMembershipId, organizationId: e2eContext.organizationId, title: 'A lesson on its own' },
      });
    } finally {
      await prisma.$disconnect();
    }
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner/library');
    const tile = page.getByTestId('unit-tile').first();
    await expect(tile).toBeVisible();
    const row = page.getByTestId('loose-lesson').first();
    await expect(row).toBeVisible();
    const page_ = rgb(await backgroundOf(page.locator('body')));
    for (const surface of [tile, row]) {
      const [r, g, b] = rgb(await backgroundOf(surface));
      // hsl(48 100% 99%): near white, and not the page's cream.
      expect(Math.min(r!, g!, b!)).toBeGreaterThanOrEqual(248);
      expect([r, g, b]).not.toEqual(page_);
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/library-home.png`, fullPage: true });
  });

  test('2. the unit view: glance, bars, contents, folder tabs, the run-of-show bar and the footer', async ({ page, signIn, e2eContext }) => {
    const { unitId } = await seedCommonSense(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`/app/lesson-planner/library/unit/${unitId}`);

    await expect(page.getByTestId('unit-glance-lessons')).toHaveText('3 · 1 draft');
    await expect(page.getByTestId('unit-glance-writing')).toHaveText(/\d+ min · \d+%/);
    await expect(page.getByText('Writing minutes, day by day')).toBeVisible();
    await expect(page.getByTestId('contents-row').nth(2)).toContainText('Draft');
    await expect(page.getByText('Hover between two days and click + to add a lesson right there.')).toBeVisible();

    await page.getByTestId('contents-row').nth(1).click();
    await expect(page.getByTestId('day-tab').nth(1)).toContainText('Oct 27');
    await expect(page.getByTestId('preview-day')).toHaveText('Day 2 of 3 · Oct 27');
    await expect(page.getByTestId('preview-time-bar')).toContainText('39 of 50 min');
    const run = page.getByTestId('preview-run');
    await expect(run.locator('li')).toHaveCount(4);
    await expect(run.locator('li').nth(1)).toContainText('Class Starter');
    await expect(run.locator('li').nth(1)).toContainText('Writing');
    await expect(page.getByRole('link', { name: 'Rework in the planner' })).toBeVisible();
    await expect(page.getByTestId('preview-duplicate')).toHaveText('Duplicate');
    await expect(page.getByTestId('preview-move')).toBeVisible();
    // The lesson card is white, like the tiles.
    const [r, g, b] = rgb(await backgroundOf(page.getByTestId('lesson-preview')));
    expect(Math.min(r!, g!, b!)).toBeGreaterThanOrEqual(248);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/unit-view.png`, fullPage: true });
  });

  test('4. the exit ticket prompt can be changed before Create, and the change is what students get', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`);
    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();
    await page.getByRole('checkbox', { name: /Grade 9th/ }).check();

    const box = page.getByTestId('exit-ticket-prompt');
    // Round 5, item 3: the new ending, and none of the old one.
    await expect(box).toHaveValue(/Keep it conversational, in your words, and write as much as you can/);
    await expect(box).not.toHaveValue(/first sentence|actually understand it to mean|missed class/);
    const edited = 'In your own words, what did Paine get right about government? Keep it conversational.';
    await box.fill(edited);
    await expect(page.getByTestId('exit-ticket-prompt-reset')).toBeVisible();
    await page.getByLabel('Title (optional)').fill('Exit ticket: Paine, edited');
    await page.getByRole('button', { name: /Create Assignment/i }).click();
    await expect(page.getByRole('heading', { name: 'New Assignment' })).toHaveCount(0);

    const prisma = createE2EPrismaClient();
    try {
      const assignment = await prisma.assignment.findFirstOrThrow({
        where: { title: 'Exit ticket: Paine, edited' },
        select: { prompt: true, exitTicketConfigJson: true },
      });
      expect(assignment.prompt).toBe(edited);
      expect(assignment.exitTicketConfigJson).not.toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });

  test('6. Add it adds the deck right away, and the sidebar stays closed; 5. the deck card offers Edit', async ({ page, signIn, e2eContext }) => {
    const { conversationId } = await seedCommonSense(e2eContext, { set: false, deckInChat: true });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    // 5: the deck from the chat, in the sidebar, offers Edit.
    await page.getByTestId('open-ask').click();
    await page.getByRole('tab', { name: 'From your conversation' }).click();
    const card = page.getByTestId('stack-deck').first();
    await expect(card.getByTestId('deck-edit')).toHaveAttribute('href', new RegExp(`/app/lesson-planner/${conversationId}/deck/.+\\?from=stack`));
    await page.keyboard.press('Escape');
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    // 6: Add it, with the sidebar closed.
    await expect(page.getByTestId('add-panel')).toHaveCount(0);
    await page.getByTestId('add-conversation-deck').click();
    await expect(page.getByTestId('deck-present')).toBeVisible();
    await expect(page.getByTestId('add-panel')).toHaveCount(0);
  });

  test('7–10. sub, missed-class and class-link pages follow the stack and list every Yawp! prompt by type', async ({
    page,
    signIn,
    e2eContext,
    browser,
  }) => {
    const { conversationId } = await seedCommonSense(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const send = async (audience: string, includes: string) => {
      const response = await page.request.post('/api/domain/lesson-planner/stack', {
        form: { intent: 'send-lesson', conversationId, audience, recipient: `${audience}@example.org`, includes },
      });
      expect(response.ok()).toBe(true);
      return ((await response.json()) as { url: string }).url;
    };
    const stranger = await browser.newContext();
    const visitor = await stranger.newPage();

    // 8: the sub plan, in the stack's names, in order.
    await visitor.goto(await send('sub', 'plan'));
    const subPlan = (await visitor.getByTestId('shared-body').textContent()) ?? '';
    const names = ['Read aloud: Reading Annotation — Common Sense', 'Class Starter: When rules stop making sense', 'Class Discussion', 'Exit Ticket: the single most effective rhetorical move in Common Sense'];
    const positions = names.map((name) => subPlan.indexOf(name));
    expect(positions.every((position) => position >= 0), subPlan).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(subPlan).not.toContain('Step 2');
    if (SHOTS) await visitor.screenshot({ path: `${SHOTS}/sub-plan.png`, fullPage: true });

    // 9: the missed-class page.
    await visitor.goto(await send('student', 'summary,daily-pages'));
    await expect(visitor.getByTestId('shared-in-yawp').locator('li')).toHaveText(['Class Starter', 'Exit Ticket']);
    await expect(visitor.getByTestId('shared-prompts-heading')).toHaveText('The writing prompts');
    await expect(visitor.getByTestId('shared-prompt-type')).toHaveText(['Class Starter', 'Exit Ticket']);
    await expect(visitor.getByTestId('shared-prompt-link')).toHaveCount(2);
    await expect(visitor.getByTestId('shared-prompt').nth(1)).toContainText('In your own words, explain the single most effective rhetorical move in Common Sense.');
    await expect(visitor.getByTestId('shared-prompt').nth(1)).not.toContainText('```');
    await expect(visitor.locator('body')).not.toContainText('To catch up on the Yawp!');
    if (SHOTS) await visitor.screenshot({ path: `${SHOTS}/missed-class.png`, fullPage: true });

    // 10: the class link (Post to your class).
    const posted = await page.request.post('/api/domain/lesson-planner/stack', {
      form: { intent: 'create-share', conversationId, includes: 'deck,handouts,daily-pages' },
    });
    expect(posted.ok()).toBe(true);
    await visitor.goto(((await posted.json()) as { url: string }).url);
    await expect(visitor.getByTestId('shared-in-yawp').locator('li')).toHaveText(['Class Starter', 'Exit Ticket']);
    await expect(visitor.getByTestId('shared-prompt-type')).toHaveText(['Class Starter', 'Exit Ticket']);
    await expect(visitor.getByTestId('shared-prompt-link')).toHaveCount(2);
    if (SHOTS) await visitor.screenshot({ path: `${SHOTS}/class-link.png`, fullPage: true });
    await stranger.close();
  });

  test('11. Set this lesson: confetti and the yawp line once, then the set state', async ({ page, signIn, e2eContext }) => {
    const { conversationId } = await seedCommonSense(e2eContext, { set: false });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    await expect(page.getByTestId('set-lesson')).toHaveText('Set this lesson');
    await page.getByTestId('set-lesson').click();
    await expect(page.getByTestId('yawp-line')).toHaveText('Hear me yawp, hear me yawp, hear me yaaaaaawp!');
    await expect(page.getByTestId('confetti')).toHaveCount(1);
    await expect(page.getByTestId('lesson-set')).toBeVisible();
    if (SHOTS) await page.getByTestId('lesson-set').screenshot({ path: `${SHOTS}/set-celebration.png` });
    await expect(page.getByTestId('yawp-line')).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByTestId('confetti')).toHaveCount(0);

    // Opening it again, already set: nothing plays.
    await page.reload();
    await expect(page.getByTestId('lesson-set')).toBeVisible();
    await expect(page.getByTestId('yawp-line')).toHaveCount(0);
  });

  test('11. with Reduce Motion, the yawp line and no confetti', async ({ page, signIn, e2eContext }) => {
    const { conversationId } = await seedCommonSense(e2eContext, { set: false });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.getByTestId('set-lesson').click();
    await expect(page.getByTestId('yawp-line')).toBeVisible();
    await expect(page.getByTestId('confetti')).toHaveCount(0);
  });

  test('12. Planned in: 20 minutes one day and a minute the next reads about 21 minutes, not a day', async ({ page, signIn, e2eContext }) => {
    const { conversationId } = await seedCommonSense(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const stat = page.getByTestId('stat-built');
    await expect(stat).toHaveText(/^2[0-2] min$/);
    await expect(page.getByTestId('lesson-set')).toContainText('of time working on it');
  });
});
