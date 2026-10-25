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
});
