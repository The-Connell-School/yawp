import { test, expect } from '../test-setup';
import { setFeatureFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';

/**
 * Brian, Nov 2: keep the modules for teachers, and fold them into How to Teach
 * It. Each module is one row: what students do and how the tutor helps (the
 * module description), plus that step's lesson and tutorial video.
 *
 * Behind `assignment-type-how-to-teach-it`. Flag off, and for students, the
 * page keeps the old Modules dropdown.
 */
const LESSON_URL = '/app/lesson-planner/library';
const VIDEO_URL = 'https://example.com/tutorials/thesis-driven-essay';

test.describe.serial('How to Teach It on assignment-type pages', () => {
  test.afterAll(async () => {
    await setFeatureFlag('assignment-type-how-to-teach-it', false);
    const prisma = createE2EPrismaClient();
    try {
      await prisma.assignmentModule.updateMany({
        where: { title: 'The Thesis-Driven Essay' },
        data: { lessonUrl: null, tutorialVideoUrl: null },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('flag off: teachers still see the Modules dropdown', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignment-type-how-to-teach-it', false);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
    );

    await expect(page.getByRole('button', { name: 'Modules' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'How to Teach It' })
    ).toHaveCount(0);
  });

  test('flag on: each module is a How to Teach It row with its links', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignment-type-how-to-teach-it', true);
    const prisma = createE2EPrismaClient();
    try {
      await prisma.assignmentModule.updateMany({
        where: {
          assignmentTypeId: e2eContext.thesisEssayAssignmentTypeId,
          title: 'The Thesis-Driven Essay',
        },
        data: { lessonUrl: LESSON_URL, tutorialVideoUrl: VIDEO_URL },
      });
    } finally {
      await prisma.$disconnect();
    }

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
    );

    const block = page.getByTestId('how-to-teach-it');
    await expect(
      block.getByRole('heading', { name: 'How to Teach It' })
    ).toBeVisible();
    // The old dropdown is replaced, not duplicated.
    await expect(page.getByRole('button', { name: 'Modules' })).toHaveCount(0);

    const row = block.getByTestId('how-to-teach-it-row').first();
    await expect(row.getByRole('link', { name: 'Open lesson' })).toHaveAttribute(
      'href',
      LESSON_URL
    );
    const video = row.getByRole('link', { name: 'Watch tutorial' });
    await expect(video).toHaveAttribute('href', VIDEO_URL);
    await expect(video).toHaveAttribute('target', '_blank');

    // Collapsed until asked: the description is behind the step name.
    const step = row.getByRole('button', { name: 'The Thesis-Driven Essay' });
    await expect(step).toHaveAttribute('aria-expanded', 'false');
    await step.click();
    await expect(
      row.getByText('Write a formal, thesis-driven essay.')
    ).toBeVisible();
  });

  test('flag on: a module with no links still shows as a row', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignment-type-how-to-teach-it', true);
    const prisma = createE2EPrismaClient();
    try {
      await prisma.assignmentModule.updateMany({
        where: { assignmentTypeId: e2eContext.thesisEssayAssignmentTypeId },
        data: { lessonUrl: null, tutorialVideoUrl: null },
      });
    } finally {
      await prisma.$disconnect();
    }

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
    );

    const row = page.getByTestId('how-to-teach-it-row').first();
    await expect(
      row.getByRole('button', { name: 'The Thesis-Driven Essay' })
    ).toBeVisible();
    await expect(row.getByRole('link')).toHaveCount(0);
  });

  test('flag on: students keep the Modules dropdown', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('assignment-type-how-to-teach-it', true);
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
    );

    await expect(page.getByRole('button', { name: 'Modules' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'How to Teach It' })
    ).toHaveCount(0);
  });
});
