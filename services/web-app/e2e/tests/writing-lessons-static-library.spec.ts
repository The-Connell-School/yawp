import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Writing practice prototype', () => {
  test('keeps writing practice off the student dashboard', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await expect(
      page.getByRole('link', { name: /writing practice/i })
    ).toHaveCount(0);
  });

  test('loads lessons by direct URL and supports a self-guided practice check', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { writingPracticeEnabled: true },
      });

      await signIn(e2eContext.userEmail, 'johndoe');
      await page.goto('/app/writing-lessons');

      await expect(
        page.getByRole('heading', { name: /writing practice/i })
      ).toBeVisible();

      const studentIntro = page.getByTestId('writing-practice-student-intro');
      await expect(studentIntro).toBeVisible();
      await expect(studentIntro).toContainText(
        'This is practice, not graded work.'
      );
      await expect(studentIntro).toContainText(
        'Pick a lesson below, read the example, then answer the practice prompt.'
      );
      await expect(studentIntro).not.toContainText("your students' writing");

      await expect(
        page.getByRole('link', { name: /revising for wordiness/i })
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: /comma splices/i })
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: /pronoun agreement/i })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /^New .+ assignment$/ })
      ).toHaveCount(0);

      await page.getByRole('link', { name: /revising for wordiness/i }).click();

      await expect(
        page.getByRole('heading', {
          name: 'Revising for Wordiness',
          level: 2,
        })
      ).toBeVisible();
      await expect(page.getByText(/practice prompt/i)).toBeVisible();
      await expect(
        page.getByRole('complementary').getByText('At this point in time')
      ).toBeVisible();

      await page
        .getByLabel(/your practice response/i)
        .fill('We cannot accept new applications now.');
      await page.getByRole('button', { name: /check response/i }).click();

      await expect(page.getByText(/score preview/i)).toBeVisible();
      await expect(page.getByText(/ready for tutor review/i)).toBeVisible();
      await page.getByRole('button', { name: /try another prompt/i }).click();
      await expect(page.getByText(/weak construction/i)).toBeVisible();
    } finally {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { writingPracticeEnabled: false },
      });
      await prisma.$disconnect();
    }
  });

  test('lets a teacher create a lesson assignment from the card plus button', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const assignmentTitle = `Wordiness practice ${Date.now()}`;

    try {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { writingPracticeEnabled: true },
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/writing-lessons');

      await expect(
        page.getByTestId('writing-practice-student-intro')
      ).toHaveCount(0);

      const lessonCard = page.getByTestId(
        'writing-lesson-card-revising-for-wordiness'
      );
      await expect(lessonCard).toBeVisible();

      const createButton = lessonCard.getByRole('button', {
        name: 'New Revising for Wordiness assignment',
      });
      await expect(createButton).toBeVisible();
      await createButton.click();

      const dialog = page.getByRole('dialog');
      await expect(
        dialog.getByRole('heading', {
          name: 'Assign Revising for Wordiness',
        })
      ).toBeVisible();
      await dialog.getByLabel('Assignment title').fill(assignmentTitle);
      const classCheckbox = dialog.getByRole('checkbox');
      await expect(classCheckbox).toHaveCount(1);
      await classCheckbox.check();
      await dialog.getByLabel('Due date').fill('2026-09-01');
      await expect(dialog.getByLabel('Number of problems')).toHaveValue('5');
      await dialog.getByRole('button', { name: 'Assign practice' }).click();

      await expect(
        dialog.getByText('Practice assigned to 1 class.')
      ).toBeVisible();

      await expect
        .poll(() =>
          prisma.writingPracticeAssignment.count({
            where: { title: assignmentTitle },
          })
        )
        .toBe(1);
    } finally {
      await prisma.writingPracticeAssignment.deleteMany({
        where: { title: assignmentTitle },
      });
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { writingPracticeEnabled: false },
      });
      await prisma.$disconnect();
    }
  });
});
