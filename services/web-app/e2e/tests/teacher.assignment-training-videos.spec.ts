import { setFeatureFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';
import { test, expect } from '../test-setup';
import { ASSIGNMENT_TRAINING_VIDEOS_FLAG } from '../../app/domain/feature-flags/feature-flags';

/**
 * Brian, round 6: training videos move from the Faculty Lounge's Trainings to
 * the assignment each one teaches. The Thesis-Driven Essay course's lessons
 * hang off the matching steps of the Thesis-Driven Essay page.
 */

const TEACHER_PASSWORD = 'teacher-e2e-password';
const STEP = { title: 'Thesis Statement', position: 3, description: 'Write your thesis statement.' };

test.describe.serial('Training videos on the assignment page', () => {
  let stepId = '';
  let trainingId = '';

  test.beforeAll(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      stepId = (
        await prisma.assignmentModule.create({
          data: { ...STEP, assignmentTypeId: e2eContext.thesisEssayAssignmentTypeId },
          select: { id: true },
        })
      ).id;
      trainingId = (
        await prisma.teacherTraining.create({
          data: {
            title: 'The Thesis-Driven Essay',
            description: 'Brian’s course, for the videos spec.',
            position: 60,
            teacherTrainingModules: {
              create: [
                {
                  title: 'Lesson 3: Thesis Statement',
                  position: 8,
                  description: 'How Brian teaches the thesis.',
                  videoS3Key: 'teacher-trainings/e2e/lesson-3.mp4',
                  videoDuration: 300,
                  resources: {
                    create: [{ name: 'lesson-3-captions.vtt', contentType: 'text/vtt', blob: Buffer.from('WEBVTT\n') }],
                  },
                },
                // No video, so nothing to show.
                { title: 'Lesson 5: Body Paragraphs', position: 10, description: 'Body.' },
              ],
            },
          },
          select: { id: true },
        })
      ).id;
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    await setFeatureFlag(ASSIGNMENT_TRAINING_VIDEOS_FLAG, false);
    const prisma = createE2EPrismaClient();
    try {
      if (stepId) await prisma.assignmentModule.deleteMany({ where: { id: stepId } });
      if (trainingId) {
        await prisma.teacherTrainingModule.deleteMany({ where: { teacherTrainingId: trainingId } });
        await prisma.teacherTraining.delete({ where: { id: trainingId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test('flag off: the assignment page is as before', async ({ page, signIn, e2eContext }) => {
    await setFeatureFlag(ASSIGNMENT_TRAINING_VIDEOS_FLAG, false);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`);
    await page.getByRole('button', { name: 'Modules' }).click();
    await page.getByRole('button', { name: STEP.title }).click();
    await expect(page.getByText(STEP.description)).toBeVisible();
    await expect(page.getByText(/How to teach this/)).toHaveCount(0);
  });

  test("flag on: the step's training video sits in its module, and leads to the lesson in Trainings", async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setFeatureFlag(ASSIGNMENT_TRAINING_VIDEOS_FLAG, true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`);
    await page.getByRole('button', { name: 'Modules' }).click();
    await page.getByRole('button', { name: STEP.title }).click();

    const block = page.getByRole('figure').filter({ hasText: 'How to teach this: Lesson 3: Thesis Statement' });
    await expect(block).toBeVisible();
    // Played here when the video can be signed; either way the lesson is one click away.
    const lesson = block.getByRole('link', { name: /in Trainings/ });
    await expect(lesson).toHaveAttribute('href', new RegExp(`^/app/teacher-trainings/${trainingId}/modules/[^/]+$`));
    await page.goto((await lesson.getAttribute('href'))!);
    await expect(page.getByRole('heading', { name: 'Lesson 3: Thesis Statement' }).first()).toBeVisible();
  });
});
