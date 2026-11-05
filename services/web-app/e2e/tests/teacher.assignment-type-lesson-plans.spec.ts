import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setFeatureFlag, setLessonPlannerReviewFlag } from '../feature-flags';

// How to Teach It → ready-built lesson plans (Kevin, Nov 5): the course card's
// "Lesson plan" opens Brian's lesson in the teacher's own Lesson Planner, on
// the stack page, behind `assignment-type-lesson-plans`. With it off, the row
// is the PDF, as #893 ships it.

const TEACHER_PASSWORD = 'teacher-e2e-password';
const OPEN_PRE_WRITING = '/app/lesson-planner/yawp/pre-writing';

async function landingFlags(on: boolean) {
  await setFeatureFlag('assignment-type-landing-v2', on);
  await setFeatureFlag('assignment-type-landing-thesis-essay', on);
}

async function clearYawpLessons(teacherMembershipId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.lessonPlanConversation.deleteMany({
      where: { membershipId: teacherMembershipId, yawpLessonSlug: { not: null } },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** A Pre-Writing type for this school, as the catalog ships it (`kind: prewriting`). */
async function ensurePrewritingType(organizationId: string): Promise<string> {
  const prisma = createE2EPrismaClient();
  try {
    const existing = await prisma.assignmentType.findFirst({
      where: { kind: 'prewriting', ownerOrgId: organizationId },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await prisma.assignmentType.create({
      data: {
        title: 'Pre-Writing',
        kind: 'prewriting',
        description: 'Pre-writing before the essay.',
        position: 98001,
        ownerOrgId: organizationId,
        organizationAssignments: { create: { organizationId } },
      },
      select: { id: true },
    });
    return created.id;
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('How to Teach It: lesson plans in the Lesson Planner', () => {
  test.beforeAll(async ({}, testInfo) => {
    void testInfo;
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
    await setLessonPlannerReviewFlag('lesson_planner_stack_v3', true);
  });

  test.afterAll(async () => {
    await landingFlags(false);
    await setFeatureFlag('assignment-type-lesson-plans', false);
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', false);
    await setLessonPlannerReviewFlag('lesson_planner_stack_v3', false);
  });

  test('the course card opens Brian’s lesson as a stack in the teacher’s planner, once', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await landingFlags(true);
    await setFeatureFlag('assignment-type-lesson-plans', true);
    await clearYawpLessons(e2eContext.teacherMembershipId);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`);

    const course = page.getByTestId('thesis-essay-course');
    await expect(course.getByTestId('course-lesson')).toHaveCount(8);
    const plan = course.getByRole('link', {
      name: 'Pre-writing: lesson plan (opens in your Lesson Planner)',
    });
    await expect(plan).toHaveAttribute('href', OPEN_PRE_WRITING);
    // Into the planner, not a new tab with a PDF.
    await expect(plan).not.toHaveAttribute('target', '_blank');
    // The deck still downloads from the row.
    await expect(
      course.getByRole('link', { name: 'Pre-writing: slide deck (PowerPoint)' })
    ).toBeVisible();

    await plan.click();
    await page.waitForURL(/\/app\/lesson-planner\/[\w-]+\/packet/);
    const stackUrl = page.url();
    const stack = page.getByTestId('stack-v3');
    await expect(stack).toBeVisible();
    await expect(page.getByTestId('stack-title')).toHaveText('Pre-writing');
    // Brian's plan, as steps in the run of show, timed and typed.
    const titles = page.getByTestId('run-card-title');
    await expect(titles.first()).toBeVisible();
    expect(await titles.count()).toBeGreaterThanOrEqual(5);
    await expect(titles.first()).toContainText('What’s happening in this picture?');
    await expect(page.getByTestId('writing-badge').first()).toBeVisible();

    // Clicking again opens the same copy rather than a second one.
    await page.goto(OPEN_PRE_WRITING);
    await page.waitForURL(/\/app\/lesson-planner\/[\w-]+\/packet/);
    expect(page.url()).toBe(stackUrl);

    // And it is in the teacher's library.
    const prisma = createE2EPrismaClient();
    try {
      const copies = await prisma.lessonPlanConversation.findMany({
        where: { membershipId: e2eContext.teacherMembershipId, yawpLessonSlug: 'pre-writing', deletedAt: null },
        select: { id: true, title: true, materials: { select: { id: true } } },
      });
      expect(copies).toHaveLength(1);
      expect(copies[0]!.title).toBe('Pre-writing');
      expect(copies[0]!.materials.length).toBeGreaterThanOrEqual(5);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('Pre-Writing gets its own How to Teach It, with Lesson 2 and its deck', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await landingFlags(true);
    await setFeatureFlag('assignment-type-lesson-plans', true);
    const prewritingTypeId = await ensurePrewritingType(e2eContext.organizationId);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${prewritingTypeId}`);

    await expect(page.getByRole('heading', { name: 'How to Teach It' })).toBeVisible();
    const box = page.getByTestId('how-to-teach-spotlight');
    const plan = box.getByRole('link', {
      name: 'Pre-writing: lesson plan (opens in your Lesson Planner)',
    });
    await expect(plan).toHaveAttribute('href', OPEN_PRE_WRITING);
    await expect(
      box.getByRole('link', { name: 'Pre-writing: slide deck (PowerPoint)' })
    ).toHaveAttribute('href', '/courses/thesis-driven-essay/02-pre-writing.pptx');
    // Brian's own sections are still there, word for word.
    await expect(page.getByRole('button', { name: 'How it works' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'When to use it' })).toBeVisible();
  });

  test('with the flag off, the row is Brian’s PDF and the route is not there', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await landingFlags(true);
    await setFeatureFlag('assignment-type-lesson-plans', false);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`);

    const course = page.getByTestId('thesis-essay-course');
    const pdf = course.getByRole('link', { name: 'Pre-writing: lesson plan (PDF)' });
    await expect(pdf).toHaveAttribute(
      'href',
      '/courses/thesis-driven-essay/02-lesson-plan-pre-writing.pdf'
    );
    await expect(
      course.getByRole('link', { name: 'Pre-writing: lesson plan (opens in your Lesson Planner)' })
    ).toHaveCount(0);

    const response = await page.request.get(OPEN_PRE_WRITING, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
  });
});
