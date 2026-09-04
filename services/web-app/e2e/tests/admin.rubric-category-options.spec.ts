import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Customizable rubric categories', () => {
  test.setTimeout(90_000);

  test('sets score labels, category feedback, and grammar highlighting per category', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now();
    const title = `Category Options E2E Type ${suffix}`;
    let assignmentTypeId: string | null = null;

    try {
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto('/app/admin/assignments');
      await expect(
        page.getByRole('heading', { name: 'Assignment Types' })
      ).toBeVisible();

      await page.getByRole('link', { name: 'Create assignment type' }).click();
      await expect(
        page.getByRole('heading', { name: 'Create assignment type' })
      ).toBeVisible();

      await page.getByLabel('Title').fill(title);
      await page
        .getByLabel('Description')
        .fill('Created by the customizable rubric category e2e test.');

      await page.getByTestId('rubric-add-category').click();
      await page.getByTestId('rubric-add-category').click();

      // Category 1: custom score labels, feedback box off, grammar off.
      await page.getByTestId('rubric-category-row-0').click();
      await page.getByLabel('Label', { exact: true }).fill('Daily Habit');
      await page.getByLabel('Weight %').fill('60');
      await page
        .locator('#category-edit-description')
        .fill('Did the student write today?');
      await page.getByLabel('Score 1 label').fill('Skipped');
      await page.getByLabel('Score 3 label').fill('Showed up');
      await page.getByLabel('Score 5 label').fill('Every day');
      await page.getByLabel('Category feedback').click();
      await expect(page.getByLabel('Category feedback')).not.toBeChecked();
      await expect(page.getByLabel('Grammar highlighting')).not.toBeChecked();
      await page.getByRole('button', { name: 'Done' }).click();

      // Category 2: default feedback box, grammar highlighting explicitly on.
      await page.getByTestId('rubric-category-row-1').click();
      await page.getByLabel('Label', { exact: true }).fill('Syntax And Style');
      await page.getByLabel('Weight %').fill('40');
      await page
        .locator('#category-edit-description')
        .fill('Sentences read cleanly.');
      await page.getByLabel('Grammar highlighting').click();
      await expect(page.getByLabel('Grammar highlighting')).toBeChecked();
      await page.getByRole('button', { name: 'Done' }).click();

      await Promise.all([
        page.waitForURL(
          (url) =>
            url.pathname.startsWith('/app/admin/assignment-types/') &&
            url.pathname !== '/app/admin/assignment-types/new',
          { timeout: 15_000 }
        ),
        page.getByRole('button', { name: 'Create' }).click(),
      ]);
      assignmentTypeId = page.url().split('/').pop() ?? null;
      expect(assignmentTypeId).toBeTruthy();

      const created = await prisma.assignmentType.findUniqueOrThrow({
        where: { id: assignmentTypeId! },
        select: { rubricJson: true },
      });

      expect(created.rubricJson).toMatchObject({
        categories: [
          {
            key: 'daily_habit',
            label: 'Daily Habit',
            weight: 0.6,
            description: 'Did the student write today?',
            scoreLabels: [
              { value: 1, label: 'Skipped' },
              { value: 3, label: 'Showed up' },
              { value: 5, label: 'Every day' },
            ],
            feedbackEnabled: false,
          },
          {
            key: 'syntax_and_style',
            label: 'Syntax And Style',
            weight: 0.4,
            description: 'Sentences read cleanly.',
            grammarHighlighting: true,
          },
        ],
      });

      // The category that never touched a toggle stores nothing for it, so it
      // keeps behaving exactly as rubrics did before these settings existed.
      const storedCategories = (
        created.rubricJson as { categories: Record<string, unknown>[] }
      ).categories;
      expect(storedCategories[0]).not.toHaveProperty('grammarHighlighting');
      expect(storedCategories[1]).not.toHaveProperty('feedbackEnabled');
      expect(storedCategories[1]).not.toHaveProperty('scoreLabels');

      // Reopening the saved rubric shows the settings that were stored.
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Edit assignment type' })
      ).toBeVisible();
      await page.getByTestId('rubric-category-row-0').click();
      await expect(page.getByLabel('Score 1 label')).toHaveValue('Skipped');
      await expect(page.getByLabel('Score 5 label')).toHaveValue('Every day');
      await expect(page.getByLabel('Category feedback')).not.toBeChecked();
    } finally {
      if (assignmentTypeId) {
        await prisma.assignmentModule.deleteMany({
          where: { assignmentTypeId },
        });
        await prisma.organizationAssignmentType.deleteMany({
          where: { assignmentTypeId },
        });
        await prisma.assignmentType.deleteMany({
          where: { id: assignmentTypeId },
        });
      }
      await prisma.$disconnect();
    }
  });
});
