/**
 * Brian's round 3 notes, Oct 25 (docs/plans/2026-10-25-brian-round-3.md),
 * on his lesson "Day 1: The Man Who Made Himself".
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
];

type Ctx = { teacherMembershipId: string; organizationId: string };

const AT = new Date(Date.UTC(2026, 9, 25, 9));

const DECK = {
  title: 'The Man Who Made Himself',
  slides: [
    { layout: 'title', title: 'The Man Who Made Himself', speakerNotes: 'Let the room settle.' },
    {
      layout: 'agenda',
      title: "Today's program",
      speakerNotes: 'Walk through it.',
      agenda: [
        { title: 'Class starter', minutes: 5 },
        { title: 'Who is Franklin?', minutes: 7 },
        { title: 'Read aloud', minutes: 12 },
        { title: 'Close reading discussion', minutes: 16 },
        { title: 'Daily Pages', minutes: 8 },
        { title: 'Closing', minutes: 3 },
      ],
    },
  ],
};

/**
 * Brian's Day 1, as the planner named it, with no period stored. The Close
 * Reading Discussion mentions "class starter writing" and has a handout.
 */
async function seedFranklin(ctx: Ctx) {
  const prisma = createE2EPrismaClient();
  try {
    const unit = await prisma.lessonPlanUnit.create({
      data: { membershipId: ctx.teacherMembershipId, organizationId: ctx.organizationId, title: 'Age of Reason' },
    });
    const pieces = [
      { kind: 'class-starter', title: 'The version of yourself you’re building', minutes: 5, audience: 'student', content: 'Think about one habit you have deliberately tried to build.' },
      { kind: 'step', title: 'Context: Who Is Franklin, and Why Does He Matter Here?', minutes: 7, stepType: 'context', content: 'Brief lecture.' },
      { kind: 'step', title: 'Read Aloud', minutes: 12, stepType: 'read_aloud', content: 'Read the Philadelphia arrival passage aloud.' },
      {
        kind: 'step',
        title: 'Close Reading Discussion',
        minutes: 15,
        stepType: 'activity',
        hasHandout: true,
        content: 'Pairs for 4 minutes, then whole class for 11. When students make connections to their own class starter writing, follow those threads.',
      },
      { kind: 'daily-pages', title: 'Franklin’s self-made method', minutes: 10, audience: 'student', content: 'Choose one specific moment from the excerpt.' },
      { kind: 'step', title: 'Closing', minutes: 3, stepType: 'closing', content: 'One question, whole class, no writing.' },
    ];
    const day = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: ctx.teacherMembershipId,
        organizationId: ctx.organizationId,
        title: 'Day 1: The Man Who Made Himself (50 min) {type: context}',
        unitId: unit.id,
        unitDay: 1,
        setAt: AT,
        materials: {
          create: [
            ...pieces.map((piece, index) => ({
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
              hasHandout: piece.hasHandout ?? null,
            })),
            {
              sourceMessageId: 'seed-deck',
              sourceCreatedAt: new Date(AT.getTime() + 100),
              blockKey: 'deck',
              slot: 'deck',
              kind: 'slides',
              title: DECK.title,
              audience: 'teacher',
              content: '```yawp-slides\n' + JSON.stringify(DECK) + '\n```',
            },
          ],
        },
      },
      select: { id: true },
    });
    return { unitId: unit.id, conversationId: day.id };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("Brian's round 3 (Oct 25)", () => {
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

  test('the stack: a clean title, the period, a day to pick, only real writing, and no period to pick', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const { conversationId } = await seedFranklin(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    // 1.1: no tags or minutes in the title.
    await expect(page.getByTestId('stack-title')).toHaveText('Day 1: The Man Who Made Himself');
    // 1.2: the period the title gave, kept.
    await expect(page.getByTestId('stack-chip-period')).toHaveValue('50');
    // 1.3: Class Starter 5 + Daily Pages 10; the discussion is not writing.
    await expect(page.getByTestId('writing-strip')).toContainText('29% of class is writing · 15 min');
    // 1.5: nothing to pick about the period.
    await expect(page.getByText('Pick the period length')).toHaveCount(0);
    await expect(page.getByText('Fits the period (2 min over now)')).toBeVisible();

    // 1.2: Pick a day opens the picker, and a day can be set and cleared.
    await page.evaluate(() => {
      HTMLInputElement.prototype.showPicker = function () {
        (window as unknown as { picked: string }).picked = this.type;
      };
    });
    await expect(page.getByTestId('stack-chip-date')).toHaveText('Pick a day');
    await page.getByTestId('stack-chip-date').click();
    expect(await page.evaluate(() => (window as unknown as { picked?: string }).picked)).toBe('date');
    await page.getByTestId('stack-date-input').fill('2026-10-27');
    await expect(page.getByTestId('stack-chip-date')).toHaveText('Tue, Oct 27');
    await page.getByTestId('stack-date-clear').click();
    await expect(page.getByTestId('stack-chip-date')).toHaveText('Pick a day');
  });

  test('the unit view: no date until one is set; Open slide deck and Open the stack', async ({ page, signIn, e2eContext }) => {
    const { unitId, conversationId } = await seedFranklin(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/library/unit/${unitId}`);

    await expect(page.getByTestId('preview-title')).toHaveText('Day 1: The Man Who Made Himself');
    await expect(page.getByTestId('preview-day')).toHaveText('Day 1 of 1');
    await expect(page.getByTestId('lesson-preview')).toContainText('29% writing · 15 min');
    await expect(page.getByTestId('preview-open')).toHaveText('Open the stack');
    await expect(page.getByTestId('preview-open')).toHaveAttribute('href', `/app/lesson-planner/${conversationId}/packet`);
    await expect(page.getByTestId('preview-open-deck')).toHaveText('Open slide deck');
    await expect(page.getByTestId('preview-open-deck')).toHaveAttribute('href', new RegExp(`^/present/${conversationId}/`));

    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanConversation.update({ where: { id: conversationId }, data: { lessonDate: new Date('2026-10-27T12:00:00Z') } });
    } finally {
      await prisma.$disconnect();
    }
    await page.reload();
    await expect(page.getByTestId('preview-day')).toHaveText('Day 1 of 1 · Oct 27');
  });

  test('the family page: prompts and handouts by type, what is due, and slides with the stack’s times', async ({
    page,
    signIn,
    e2eContext,
    browser,
  }) => {
    const { conversationId } = await seedFranklin(e2eContext);
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanMaterial.updateMany({
        where: { conversationId, kind: 'daily-pages' },
        data: { yawpHref: '/app/assignment-types/x', yawpCreatedAt: new Date() },
      });
    } finally {
      await prisma.$disconnect();
    }
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const response = await page.request.post('/api/domain/lesson-planner/stack', {
      form: { intent: 'send-lesson', conversationId, audience: 'family', recipient: 'family@example.org', includes: 'deck,daily-pages,handouts' },
    });
    expect(response.ok()).toBe(true);
    const { url } = (await response.json()) as { url: string };

    const stranger = await browser.newContext();
    const visitor = await stranger.newPage();
    await visitor.goto(url);
    await expect(visitor.locator('h1').first()).toHaveText('Day 1: The Man Who Made Himself');
    // 1.9: what a family needs to know.
    await expect(visitor.getByTestId('shared-in-yawp-lead')).toHaveText(
      'These assignments are available to your student in Yawp! and should be completed before the next class session (or by an agreed-upon time):'
    );
    // By type since Brian's round 4, item 3.
    await expect(visitor.getByTestId('shared-in-yawp').locator('li')).toHaveText(['Daily Pages']);
    // 1.7: one heading per prompt, by type, under a plural heading.
    await expect(visitor.getByTestId('shared-prompts-heading')).toHaveText('The writing prompts');
    await expect(visitor.getByTestId('shared-prompt-type')).toHaveText(['Class Starter', 'Daily Pages']);
    // 1.8: handouts from writing prompts say their type.
    await expect(visitor.getByTestId('shared-handout').first()).toContainText('Class Starter: The version of yourself');
    await expect(visitor.getByTestId('shared-handout').nth(1)).toContainText('Daily Pages: Franklin’s self-made method');
    // 1.4: the agenda slide reads the stack's 15 and 10, not 16 and 8.
    const agenda = visitor.getByTestId('shared-slide').nth(1);
    await expect(agenda).toContainText('Close reading discussion (15 min)');
    await expect(agenda).toContainText('Daily Pages (10 min)');
    await stranger.close();
  });
});
