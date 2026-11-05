/**
 * Kevin's unit-build feedback, Oct 25
 * (docs/plans/2026-10-25-kevin-unit-build-feedback.md).
 *
 * Every lesson is seeded: the model is never called (no key in e2e, so a
 * model call fails fast and the page's own fallback shows).
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
  'lesson_planner_plan_export_v2',
  'lesson_planner_share',
];

type Ctx = { teacherMembershipId: string; organizationId: string };
type Piece = { kind: string; title: string; minutes: number; content: string; audience?: string; hasHandout?: boolean };

const AT = new Date(Date.UTC(2026, 9, 25, 9));

/** A unit planned in a 60-minute chat, and its Day 1, built before days took the period. */
async function seedUnitDay(ctx: Ctx, pieces: Piece[], { dayPeriod = null as number | null } = {}) {
  const prisma = createE2EPrismaClient();
  try {
    const unit = await prisma.lessonPlanUnit.create({
      data: { membershipId: ctx.teacherMembershipId, organizationId: ctx.organizationId, title: 'Julius Caesar' },
    });
    await prisma.lessonPlanConversation.create({
      data: {
        membershipId: ctx.teacherMembershipId,
        organizationId: ctx.organizationId,
        title: 'Julius Caesar unit',
        periodMinutes: 60,
        lessonClassLabel: 'English 10',
        unitId: unit.id,
        unitDay: null,
      },
    });
    const day = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: ctx.teacherMembershipId,
        organizationId: ctx.organizationId,
        title: 'Day 1 — What is memetic desire?',
        unitId: unit.id,
        unitDay: 1,
        periodMinutes: dayPeriod,
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
            hasHandout: piece.hasHandout ?? null,
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

const LONG_DAY: Piece[] = [
  { kind: 'class-starter', title: 'Class Starter: What do you want?', minutes: 10, content: 'Write about something you wanted because someone else did.', audience: 'student' },
  { kind: 'step', title: 'Mini-lecture: memetic desire', minutes: 25, content: 'Introduce Girard: we desire what others desire.' },
  { kind: 'step', title: 'Read the excerpt', minutes: 25, content: 'Read Act 1, Scene 2 together.' },
  { kind: 'exit-ticket', title: 'Exit ticket', minutes: 15, content: 'Name one person Cassius imitates.', audience: 'student' },
];


const UNIT = {
  title: 'Julius Caesar',
  subtitle: 'English 10 · 3 periods',
  endsWith: 'A thesis-driven essay on a Girardian reading of the play',
  days: [
    { day: 1, title: 'What is memetic desire?', objective: 'Name what Girard means by imitated desire', students: 'Write about wanting something because someone else did', minutes: 60 },
    { day: 2, title: 'Cassius wants what Caesar has', objective: 'Trace imitation in Act 1', students: 'Map who imitates whom', minutes: 60 },
  ],
};

/** A unit planned in the chat (the map), saved in the library. */
async function seedUnitMap(ctx: Ctx, extraReply = '') {
  const prisma = createE2EPrismaClient();
  try {
    const unit = await prisma.lessonPlanUnit.create({
      data: { membershipId: ctx.teacherMembershipId, organizationId: ctx.organizationId, title: UNIT.title },
    });
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: ctx.teacherMembershipId,
        organizationId: ctx.organizationId,
        title: 'Julius Caesar unit',
        periodMinutes: 60,
        unitId: unit.id,
        unitDay: null,
        messages: {
          create: [
            { role: 'user', content: 'Create a unit on Julius Caesar for English 10.', createdAt: new Date(AT.getTime()) },
            {
              role: 'assistant',
              content: ['Here is the arc.', '', '```yawp-unit', JSON.stringify(UNIT), '```', extraReply].join('\n'),
              createdAt: new Date(AT.getTime() + 1000),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { unitId: unit.id, conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("Kevin's unit-build feedback (Oct 25)", () => {
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

  test("note 8a: a unit's day knows its 60-minute period, so 75 minutes reads as over", async ({ page, signIn, e2eContext }) => {
    const { conversationId } = await seedUnitDay(e2eContext, LONG_DAY);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await expect(page.getByTestId('time-status')).toContainText('15 min over');
    const prisma = createE2EPrismaClient();
    try {
      const day = await prisma.lessonPlanConversation.findUniqueOrThrow({ where: { id: conversationId }, select: { periodMinutes: true, lessonClassLabel: true } });
      expect(day).toEqual({ periodMinutes: 60, lessonClassLabel: 'English 10' });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('notes 10b and 11: downloads show they work, save real files, and say why when there is nothing to print', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const { conversationId } = await seedUnitDay(e2eContext, LONG_DAY);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const box = page.getByTestId('print-for-class');

    // The student pieces print as the handout: a real PDF.
    const pdf = page.waitForEvent('download');
    await box.getByTestId('handouts-pdf').click();
    const saved = await pdf;
    expect(saved.suggestedFilename()).toBe('Day 1 - What is memetic desire - Student handout.pdf');
    const bytes = await (await import('node:fs/promises')).readFile((await saved.path())!);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');

    const word = page.waitForEvent('download');
    await box.getByTestId('plan-word').click();
    expect((await word).suggestedFilename()).toMatch(/\.docx$/);

    // With no step marked for students, it says so instead of saving a file.
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanMaterial.updateMany({ where: { conversationId }, data: { hasHandout: false } });
    } finally {
      await prisma.$disconnect();
    }
    await page.reload();
    await page.getByTestId('handouts-pdf').click();
    await expect(page.getByTestId('handouts-pdf-problem')).toHaveText('Pick the steps that go in the handout first.');
  });

  test('note 12c: the run of show with teacher notes opens at once, and writes the notes after', async ({ page, signIn, e2eContext }) => {
    const { conversationId } = await seedUnitDay(e2eContext, LONG_DAY);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const started = Date.now();
    await page.goto(`/show/${conversationId}?from=stack`);
    await expect(page.getByTestId('show-now')).toBeVisible();
    expect(Date.now() - started).toBeLessThan(8000);
    // The step's own text is there from the first moment.
    await expect(page.getByTestId('show-notes')).toContainText('Write about something you wanted');
    // With no model here, writing ends and the page keeps working.
    await expect(page.getByTestId('notes-writing')).toHaveCount(0, { timeout: 30_000 });
    await page.getByTestId('show-next').click();
    await expect(page.getByTestId('show-notes')).toContainText('Introduce Girard');
  });

  test('notes 4 and 5: the unit is saved, its plan shows with the unit, and Build this day shows one line', async ({ page, signIn, e2eContext }) => {
    const { unitId, conversationId } = await seedUnitMap(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    const saved = page.getByTestId('unit-saved');
    await expect(saved).toContainText('Saved to your library as Julius Caesar. Build the days whenever you');
    await expect(saved.getByRole('link', { name: 'Open the unit' })).toHaveAttribute('href', `/app/lesson-planner/library/unit/${unitId}`);

    // The library's unit page keeps the arc, with a way to build each day.
    await saved.getByRole('link', { name: 'Open the unit' }).click();
    const plan = page.getByTestId('unit-plan');
    await expect(plan).toContainText('Ends with: A thesis-driven essay on a Girardian reading of the play');
    await expect(plan.getByTestId('unit-plan-day')).toHaveCount(2);
    await expect(plan.getByTestId('unit-plan-build').first()).toHaveAttribute('href', `/app/lesson-planner?c=${conversationId}&buildDay=1`);

    // Build this day, from there: one short line in the chat, the request under Details.
    // The turn is held, so the line is read before any answer (there is no model here).
    const posted: string[] = [];
    await page.route('**/api/domain/lesson-planner', async (route) => {
      posted.push(route.request().postData() ?? '');
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      await route.abort().catch(() => {});
    });
    await plan.getByTestId('unit-plan-build').first().click();
    const sent = page.locator('[data-role="user"]').last();
    await expect(sent.getByTestId('user-display')).toHaveText('Building Day 1 of Julius Caesar: What is memetic desire?');
    await expect(sent.getByText('Objective: Name what Girard means by imitated desire')).toBeHidden();
    await sent.getByTestId('user-details').click();
    await expect(sent.getByText('Objective: Name what Girard means by imitated desire')).toBeVisible();
    await expect(page).not.toHaveURL(/buildDay=/);
    expect(new URLSearchParams(posted[0]).get('displayText')).toBe('Building Day 1 of Julius Caesar: What is memetic desire?');
    expect(new URLSearchParams(posted[0]).get('message')).toContain('Objective: Name what Girard means by imitated desire');
  });

  test('note 2: no code boxes or internal names in a reply', async ({ page, signIn, e2eContext }) => {
    const { conversationId } = await seedUnitMap(
      e2eContext,
      "\nThe class starters on day 1 through 4 are written into each day's `students` field."
    );
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    const reply = page.locator('main');
    await expect(reply).toContainText("written into each day's students field");
    await expect(reply.locator('code')).toHaveCount(0);
  });

  test('note 1: planning a unit asks how long each class period is', async ({ page, signIn, e2eContext }) => {
    await setLessonPlannerReviewFlag('lesson_planner_intake_v2', true);
    const prisma = createE2EPrismaClient();
    let conversationId = '';
    try {
      const conversation = await prisma.lessonPlanConversation.create({
        data: {
          membershipId: e2eContext.teacherMembershipId,
          organizationId: e2eContext.organizationId,
          title: 'Julius Caesar unit',
          messages: {
            create: [
              { role: 'user', content: 'Create a unit on Julius Caesar.', createdAt: new Date(AT.getTime()) },
              { role: 'assistant', content: 'A great play for this. What should the unit build toward?', createdAt: new Date(AT.getTime() + 1000) },
              { role: 'user', content: 'A unit that ends in a short essay on ambition.', createdAt: new Date(AT.getTime() + 2000) },
              { role: 'assistant', content: 'One quick thing first.\n\n```yawp-ask\nminutes\n```', createdAt: new Date(AT.getTime() + 3000) },
            ],
          },
        },
        select: { id: true },
      });
      conversationId = conversation.id;
    } finally {
      await prisma.$disconnect();
    }
    try {
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await expect(page.getByTestId('lesson-intake-card')).toContainText('How long is each class period?');
      await expect(page.locator('main')).not.toContainText('How long is the lesson?');
    } finally {
      await setLessonPlannerReviewFlag('lesson_planner_intake_v2', false);
    }
  });

  test('notes 8b and 8c: running over suggests a step for extra time, which leaves the timing and prints after the closing', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const { conversationId } = await seedUnitDay(e2eContext, [
      LONG_DAY[0]!,
      { kind: 'step', title: 'Mini-lecture: memetic desire', minutes: 25, content: 'Introduce Girard.' },
      { kind: 'daily-pages', title: 'Daily Pages: Who do you imitate?', minutes: 15, content: 'Write about someone you copy.', audience: 'student' },
      LONG_DAY[3]!,
    ]);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    await expect(page.getByTestId('time-over-lead')).toContainText(
      "You've added some great pieces, but this runs 5 minutes over your 60."
    );
    const suggestion = page.getByTestId('time-fix-extend');
    await expect(suggestion).toContainText('Who do you imitate?');
    await expect(page.locator('[data-testid="run-card"][data-flagged="true"]')).toHaveCount(1);
    await expect(page.getByTestId('before-class-item').filter({ hasText: 'Fits the period' })).toHaveAttribute('data-done', 'false');

    await suggestion.getByRole('button', { name: 'Move to extensions' }).click();
    const extensions = page.getByTestId('extensions');
    await expect(extensions.getByTestId('extension-step')).toHaveCount(1);
    await expect(extensions).toContainText('If you have extra time');
    await expect(page.getByTestId('run-card')).toHaveCount(3);
    await expect(page.getByTestId('time-fixes')).toHaveCount(0);
    await expect(page.getByTestId('before-class-item').filter({ hasText: 'Fits the period' })).toHaveAttribute('data-done', 'true');

    // In the run of show with teacher notes, after the timed steps.
    await page.goto(`/show/${conversationId}?from=stack`);
    await expect(page.getByTestId('show-extensions').getByTestId('show-extension')).toContainText('Who do you imitate?');
    await expect(page.getByTestId('show-rail-step')).toHaveCount(3);

    // And back into the lesson.
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await page.getByTestId('extension-back').click();
    await expect(page.getByTestId('run-card')).toHaveCount(4);
    await expect(page.getByTestId('extensions')).toHaveCount(0);
  });

  test('note 9: the slides say when the lesson changed since they were made', async ({ page, signIn, e2eContext }) => {
    const { conversationId } = await seedUnitDay(e2eContext, LONG_DAY);
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanMaterial.create({
        data: {
          conversationId,
          sourceMessageId: 'seed-deck',
          sourceCreatedAt: new Date(AT.getTime() + 100),
          blockKey: 'deck',
          slot: 'deck',
          kind: 'slides',
          title: 'Day 1 deck',
          audience: 'teacher',
          content: '```yawp-slides\n' + JSON.stringify({ title: 'Day 1', slides: [{ layout: 'title', title: 'Day 1', speakerNotes: 'Go.' }] }) + '\n```',
        },
      });
    } finally {
      await prisma.$disconnect();
    }
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await expect(page.getByTestId('print-for-class')).toBeVisible();
    await expect(page.getByTestId('deck-stale')).toHaveCount(0);

    // The lesson changes after the deck: a step is retimed.
    const db = createE2EPrismaClient();
    try {
      await db.lessonPlanMaterial.updateMany({ where: { conversationId, title: 'Read the excerpt' }, data: { minutes: 20 } });
    } finally {
      await db.$disconnect();
    }
    await page.reload();
    const stale = page.getByTestId('deck-stale');
    await expect(stale).toContainText('Your lesson changed since these slides were made.');
    await expect(stale.getByTestId('deck-stale-rebuild')).toHaveText('Rebuild the slides');
    await expect(page.getByTestId('before-class-item').filter({ hasText: 'Slides' })).toHaveAttribute('data-done', 'false');

    await stale.getByTestId('deck-stale-keep').click();
    await expect(page.getByTestId('deck-stale')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('deck-stale')).toHaveCount(0);
  });

  test('notes 12a and 12b: Before class ticks itself off, and "Planned in" is the planning time', async ({ page, signIn, e2eContext }) => {
    const { conversationId } = await seedUnitDay(e2eContext, LONG_DAY.filter((piece) => piece.title !== 'Read the excerpt'));
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const list = page.getByTestId('before-class');
    await expect(list).toContainText('Before class');
    await expect(list.getByTestId('before-class-item')).toHaveCount(4);
    await expect(list.getByTestId('before-class-item').filter({ hasText: 'Fits the period' })).toHaveAttribute('data-done', 'true');
    await expect(list.getByTestId('before-class-item').filter({ hasText: 'Date picked' })).toHaveAttribute('data-done', 'false');

    await page.getByTestId('set-lesson').click();
    const set = page.getByTestId('lesson-set');
    await expect(set).toContainText('Planned in');
    await expect(set).not.toContainText('Built in');
    await expect(set).toContainText('from first message to set');
  });

  test('notes 6a, 6b and 6c: made in Yawp! from the chat, the piece is in the lesson and the teacher is back in the chat', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    let conversationId: string;
    try {
      const conversation = await prisma.lessonPlanConversation.create({
        data: {
          membershipId: e2eContext.teacherMembershipId,
          organizationId: e2eContext.organizationId,
          title: 'Weathering and erosion',
          periodMinutes: 50,
          messages: {
            create: [
              { role: 'user', content: 'Plan a lesson on weathering and erosion.', createdAt: AT },
              {
                role: 'assistant',
                createdAt: new Date(AT.getTime() + 1000),
                content: [
                  'End with a check.',
                  '',
                  '```yawp-exit-ticket',
                  'id: ticket',
                  'kind: check',
                  'focus: explain-concept',
                  'topic: the difference between weathering and erosion',
                  'answer: objective',
                  'mustMention: Whether the material moves.',
                  '```',
                ].join('\n'),
              },
            ],
          },
        },
        select: { id: true },
      });
      conversationId = conversation.id;
    } finally {
      await prisma.$disconnect();
    }
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    // Teachers see the lesson, never "stack".
    await expect(page.getByTestId('exit-ticket-stack-toggle')).toHaveText(/add to lesson/i);

    const started = new Date();
    await page.getByTestId('exit-ticket-create').click();
    await expect(page).toHaveURL(new RegExp(`/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`));
    await page.getByLabel(/Grade 9th .* Period 1st/).check();
    await page.getByRole('button', { name: 'Create Assignment' }).click();

    await expect(page).toHaveURL(new RegExp(`/app/lesson-planner\\?c=${conversationId}`));
    await expect(page.getByTestId('made-notice')).toHaveText(/Created in Yawp! and added to your lesson\./);
    await expect(page.getByTestId('exit-ticket-stack-toggle')).toHaveText(/in your lesson/i);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    await expect(page.getByTestId('stack-lands-here')).toHaveText('Everything you add from the planner lands here, in order.');
    await expect(page.getByTestId('run-card')).toHaveCount(1);
    await expect(page.getByTestId('run-card').getByTestId('in-yawp')).toHaveText('Assignment created');

    const cleanup = createE2EPrismaClient();
    try {
      await cleanup.assignment.deleteMany({
        where: { assignmentTypeId: e2eContext.exitTicketAssignmentTypeId, createdAt: { gte: started } },
      });
    } finally {
      await cleanup.$disconnect();
    }
  });

  test('See how it works shows the lesson page, Teach it and the library as they are now', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner/how-it-works');
    await expect(page.getByRole('heading', { name: 'Your lesson, start to finish' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Teach it' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Run the show' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
    for (const clip of ['lesson-page', 'teach-it', 'library', 'unit-library']) {
      await expect(page.locator(`video[poster$="/${clip}.jpg"]`)).toHaveCount(1);
    }
    await expect(page.locator('img[src$="/print-for-class.jpg"]')).toHaveCount(1);
    await expect(page.getByText('If you have extra time', { exact: false }).first()).toBeVisible();
    // Every clip and still the guide points at is really there.
    const sources = await page.locator('video source, img[src*="lesson-planner-guide"], video[poster]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('src') ?? node.getAttribute('poster')!)
    );
    for (const source of sources) expect((await page.request.get(source)).ok(), source).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Teach it' })).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
