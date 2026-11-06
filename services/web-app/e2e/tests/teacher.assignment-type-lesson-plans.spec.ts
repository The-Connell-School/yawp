import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setFeatureFlag, setLessonPlannerReviewFlag } from '../feature-flags';

// How to Teach It (Brian, Nov 6): each course row is the slide deck to
// download and the tutorial video to watch, which opens that lesson's module
// in the Teachers' Lounge course. No lesson plan link. The ready-built stack
// (Kevin, Nov 5) stays reachable at /app/lesson-planner/yawp/<slug> behind
// `assignment-type-lesson-plans`, unlinked.

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

/** The Lounge course with a video module per lesson, as production has it. */
async function ensureLoungeCourse(): Promise<{ courseId: string; modules: Record<number, string> }> {
  const prisma = createE2EPrismaClient();
  try {
    let course = await prisma.teacherTraining.findFirst({
      where: { title: { equals: 'The Thesis-Driven Essay', mode: 'insensitive' } },
      select: { id: true, teacherTrainingModules: { select: { id: true, title: true } } },
    });
    if (!course) {
      course = await prisma.teacherTraining.create({
        data: {
          title: 'The Thesis-Driven Essay',
          position: 90,
          teacherTrainingModules: {
            create: [
              { title: 'Meet Your Instructor', position: 0, videoS3Key: 'e2e/meet.mp4' },
              { title: 'Lesson 1: Introduce Students to Yawp!', position: 6, videoS3Key: 'e2e/l1.mp4' },
              { title: 'Lesson 2: Pre-writing', position: 7, videoS3Key: 'e2e/l2.mp4' },
              { title: 'Lesson 3: Developing a Thesis Statement', position: 8, videoS3Key: 'e2e/l3.mp4' },
            ],
          },
        },
        select: { id: true, teacherTrainingModules: { select: { id: true, title: true } } },
      });
    }
    const modules: Record<number, string> = {};
    for (const module of course.teacherTrainingModules) {
      const number = Number(/^Lesson (\d+)/.exec(module.title)?.[1]);
      if (number) modules[number] = module.id;
    }
    return { courseId: course.id, modules };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('How to Teach It: slide decks, tutorial videos, and the unlinked stack', () => {
  test.beforeAll(async () => {
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
    await setLessonPlannerReviewFlag('lesson_planner_stack_v3', true);
    await setLessonPlannerReviewFlag('lesson_planner_deck_v2', true);
  });

  test.afterAll(async () => {
    await landingFlags(false);
    await setFeatureFlag('assignment-type-lesson-plans', false);
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', false);
    await setLessonPlannerReviewFlag('lesson_planner_stack_v3', false);
    await setLessonPlannerReviewFlag('lesson_planner_deck_v2', false);
  });

  test('the course card: a deck to download and a tutorial to watch per lesson, no lesson plan', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await landingFlags(true);
    const lounge = await ensureLoungeCourse();
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`);

    const course = page.getByTestId('thesis-essay-course');
    await expect(course.getByTestId('course-lesson')).toHaveCount(8);
    await expect(course.getByRole('link', { name: /lesson plan/i })).toHaveCount(0);
    await expect(
      course.getByRole('link', { name: 'Pre-writing: slide deck (PowerPoint)' })
    ).toHaveAttribute('href', '/courses/thesis-driven-essay/02-pre-writing.pptx');
    const tutorial = course.getByRole('link', { name: 'Pre-writing: tutorial video' });
    await expect(tutorial).toHaveAttribute(
      'href',
      `/app/teacher-trainings/${lounge.courseId}/modules/${lounge.modules[2]}`
    );
    // Lessons without a video module in the course have no video link.
    await expect(course.getByRole('link', { name: 'Body paragraphs: tutorial video' })).toHaveCount(0);

    // The tutorial opens the lesson's module in the Lounge.
    await tutorial.click();
    await expect(page).toHaveURL(new RegExp(`/app/teacher-trainings/${lounge.courseId}/modules/${lounge.modules[2]}$`));
  });

  test('Pre-Writing gets its own How to Teach It, with Lesson 2’s deck and video', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await landingFlags(true);
    const lounge = await ensureLoungeCourse();
    const prewritingTypeId = await ensurePrewritingType(e2eContext.organizationId);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${prewritingTypeId}`);

    await expect(page.getByRole('heading', { name: 'How to Teach It' })).toBeVisible();
    const box = page.getByTestId('how-to-teach-spotlight');
    await expect(
      box.getByRole('link', { name: 'Pre-writing: slide deck (PowerPoint)' })
    ).toHaveAttribute('href', '/courses/thesis-driven-essay/02-pre-writing.pptx');
    await expect(box.getByRole('link', { name: 'Pre-writing: tutorial video' })).toHaveAttribute(
      'href',
      `/app/teacher-trainings/${lounge.courseId}/modules/${lounge.modules[2]}`
    );
    await expect(box.getByRole('link', { name: /lesson plan/i })).toHaveCount(0);
    // Brian's own sections are still there, word for word.
    await expect(page.getByRole('button', { name: 'How it works' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'When to use it' })).toBeVisible();
  });

  test('the ready-built stack still opens by URL, with Brian’s deck in it, once per teacher', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignment-type-lesson-plans', true);
    await clearYawpLessons(e2eContext.teacherMembershipId);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);

    await page.goto(OPEN_PRE_WRITING);
    await page.waitForURL(/\/app\/lesson-planner\/[\w-]+\/packet/);
    const stackUrl = page.url();
    await expect(page.getByTestId('stack-v3')).toBeVisible();
    await expect(page.getByTestId('stack-title')).toHaveText('Pre-writing');
    const titles = page.getByTestId('run-card-title');
    await expect(titles.first()).toContainText('What’s happening in this picture?');
    expect(await titles.count()).toBeGreaterThanOrEqual(5);
    await expect(page.getByTestId('writing-badge').first()).toBeVisible();

    // Brian's deck is the lesson's deck: nothing to build.
    const printBox = page.getByTestId('print-for-class');
    await expect(printBox).toContainText('Slide deck');
    await expect(printBox).not.toContainText('No deck yet');
    await expect(printBox.getByTestId('build-deck')).toHaveCount(0);

    // Opening it again finds the same copy.
    await page.goto(OPEN_PRE_WRITING);
    await page.waitForURL(/\/app\/lesson-planner\/[\w-]+\/packet/);
    expect(page.url()).toBe(stackUrl);

    const prisma = createE2EPrismaClient();
    try {
      const copies = await prisma.lessonPlanConversation.findMany({
        where: { membershipId: e2eContext.teacherMembershipId, yawpLessonSlug: 'pre-writing', deletedAt: null },
        select: { id: true, materials: { select: { id: true } } },
      });
      expect(copies).toHaveLength(1);
      const deck = await prisma.lessonPlanMaterial.findFirst({
        where: { conversationId: copies[0]!.id, slot: 'deck' },
        select: { sourceMessageId: true, content: true },
      });
      expect(deck).not.toBeNull();
      expect((deck!.content.match(/"layout": "picture"/g) ?? []).length).toBe(8);
      expect(
        await prisma.lessonPlanUploadPicture.count({
          where: { conversationId: copies[0]!.id, membershipId: e2eContext.teacherMembershipId },
        })
      ).toBe(8);

      // Present shows Brian's slides with their pictures, loaded for this teacher.
      await page.goto(`/present/${copies[0]!.id}/${deck!.sourceMessageId}`);
      await page.waitForLoadState('networkidle');
      const picture = page.getByTestId('slide-picture').locator('img').filter({ visible: true }).first();
      await expect(picture).toBeVisible();
      await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('with the flag off, the stack route is not there', async ({ page, e2eContext, signIn }) => {
    await setFeatureFlag('assignment-type-lesson-plans', false);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const response = await page.request.get(OPEN_PRE_WRITING, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
  });
});
