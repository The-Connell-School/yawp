import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLoungeCommunityFlag, setTeacherLoungeFlag } from '../feature-flags';

// The Lounge's Thesis-Driven Essay course plays Brian's tutorials (Nov 14):
// a "Lesson N: …" module plays the tutorial that comes with the app, in place
// of the older video uploaded to it. Every other module keeps its own video.

const TEACHER_PASSWORD = 'teacher-e2e-password';
const TUTORIALS = '/courses/thesis-driven-essay/tutorials';

const MODULES = [
  { title: 'Meet Your Instructor', position: 0, videoS3Key: 'e2e/meet.mp4', videoDuration: 187 },
  { title: 'Lesson 2: Pre-writing', position: 7, videoS3Key: 'e2e/l2.mp4', videoDuration: 1865 },
  { title: 'Lesson 5: Body Paragraphs', position: 10, videoS3Key: 'e2e/l5.mp4', videoDuration: 1528 },
] as const;

type Course = { courseId: string; modules: Record<string, string> };

/** The course with the three modules this spec opens, each with an old upload. */
async function ensureCourse(): Promise<Course> {
  const prisma = createE2EPrismaClient();
  try {
    const course =
      (await prisma.teacherTraining.findFirst({
        where: { title: { equals: 'The Thesis-Driven Essay', mode: 'insensitive' } },
        select: { id: true },
      })) ??
      (await prisma.teacherTraining.create({
        data: { title: 'The Thesis-Driven Essay', position: 90 },
        select: { id: true },
      }));
    const modules: Record<string, string> = {};
    for (const module of MODULES) {
      const existing = await prisma.teacherTrainingModule.findFirst({
        where: { teacherTrainingId: course.id, title: module.title },
        select: { id: true },
      });
      const row = existing
        ? await prisma.teacherTrainingModule.update({
            where: { id: existing.id },
            data: { videoS3Key: module.videoS3Key, videoDuration: module.videoDuration },
            select: { id: true },
          })
        : await prisma.teacherTrainingModule.create({
            data: { ...module, teacherTrainingId: course.id },
            select: { id: true },
          });
      modules[module.title] = row.id;
    }
    return { courseId: course.id, modules };
  } finally {
    await prisma.$disconnect();
  }
}

/** How far this teacher got in a module, as the old video left it. */
async function setWatched(moduleId: string, membershipId: string, videoTimestamp: number | null) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.teacherTrainingModuleSession.deleteMany({
      where: { teacherTrainingModuleId: moduleId, membershipId },
    });
    if (videoTimestamp !== null) {
      await prisma.teacherTrainingModuleSession.create({
        data: { teacherTrainingModuleId: moduleId, membershipId, videoTimestamp },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial("Brian's tutorials in the Lounge's Thesis-Driven Essay course", () => {
  let course: Course;

  test.beforeAll(async () => {
    await setTeacherLoungeFlag(true);
    await setLoungeCommunityFlag(false);
    course = await ensureCourse();
  });

  test.afterAll(async () => {
    await setTeacherLoungeFlag(false);
    const prisma = createE2EPrismaClient();
    try {
      await prisma.teacherTrainingModuleSession.deleteMany({
        where: { teacherTrainingModuleId: { in: Object.values(course.modules) } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('a lesson plays his tutorial, with its poster, captions and length', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const lesson2 = course.modules['Lesson 2: Pre-writing']!;
    await setWatched(lesson2, e2eContext.teacherMembershipId, null);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/teacher-trainings/${course.courseId}/modules/${lesson2}`);

    await expect(page.getByText('Lesson 2: Pre-writing').first()).toBeVisible();
    const video = page.locator('video').first();
    await expect(video.locator('source')).toHaveAttribute('src', `${TUTORIALS}/02-pre-writing.mp4`);
    await expect(video).toHaveAttribute('poster', `${TUTORIALS}/02-pre-writing.jpg`);
    await expect(video.locator('track[kind="captions"]')).toHaveAttribute('src', `${TUTORIALS}/02-pre-writing.vtt`);
    // The browser can load it: the app serves the file.
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThan(0);
    // His video's length (13:47), not the 31:05 of the upload it replaced.
    await expect(page.getByText('13:47').first()).toBeVisible();
    await expect(page.getByText('31:05')).toHaveCount(0);
    await expect(page.getByText('0% watched')).toBeVisible();
    // The captions can be downloaded, as the Lounge offers for its own videos.
    await expect(
      page.getByTestId('teacher-training-media-accessibility').getByRole('link', { name: 'Captions' })
    ).toHaveAttribute('href', `${TUTORIALS}/02-pre-writing.vtt`);
    await expect(page.getByText('No video available for this module')).toHaveCount(0);
  });

  test('a teacher who finished the longer old video reads as finished', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const lesson2 = course.modules['Lesson 2: Pre-writing']!;
    await setWatched(lesson2, e2eContext.teacherMembershipId, 1865);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/teacher-trainings/${course.courseId}/modules/${lesson2}`);
    await expect(page.getByText('100% watched')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
  });

  test('Body paragraphs also has the supporting quotes tutorial under it', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(
      `/app/teacher-trainings/${course.courseId}/modules/${course.modules['Lesson 5: Body Paragraphs']!}`
    );
    await expect(page.locator('video').first().locator('source')).toHaveAttribute(
      'src',
      `${TUTORIALS}/05-body-paragraphs.mp4`
    );
    const more = page.getByTestId('teacher-training-more-tutorials');
    await expect(more.getByRole('heading', { name: 'Supporting quotes' })).toBeVisible();
    await expect(more.locator('video')).toHaveAttribute('src', `${TUTORIALS}/05-supporting-quotes.mp4`);
    await expect(more.locator('video track[kind="captions"]')).toHaveAttribute(
      'src',
      `${TUTORIALS}/05-supporting-quotes.vtt`
    );
  });

  test('a module that is not a lesson keeps its own video', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(
      `/app/teacher-trainings/${course.courseId}/modules/${course.modules['Meet Your Instructor']!}`
    );
    await expect(page.getByText('Meet Your Instructor').first()).toBeVisible();
    await expect(page.locator(`source[src^="${TUTORIALS}/"], video[src^="${TUTORIALS}/"]`)).toHaveCount(0);
    await expect(page.getByTestId('teacher-training-more-tutorials')).toHaveCount(0);
    await expect(page.getByText('3:07').first()).toBeVisible();
  });

  test('the course page lists each lesson at its tutorial\'s length', async ({ page, signIn, e2eContext }) => {
    await setWatched(course.modules['Lesson 2: Pre-writing']!, e2eContext.teacherMembershipId, null);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/teacher-trainings/${course.courseId}`);
    await expect(page.getByRole('heading', { name: 'The Thesis-Driven Essay' })).toBeVisible();
    await expect(page.getByText('13:47')).toBeVisible();
    await expect(page.getByText('31:05')).toHaveCount(0);
  });
});
