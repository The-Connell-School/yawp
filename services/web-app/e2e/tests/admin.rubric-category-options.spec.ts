import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Library rubric category options', () => {
  test.setTimeout(90_000);

  test('preserves selected library score labels, category feedback, and grammar highlighting', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now();
    const title = `Category Options E2E Type ${suffix}`;
    let assignmentTypeId: string | null = null;
    let rubricId: string | null = null;
    const schema = {
      name: `category-options-e2e-${suffix}`,
      title: `Category Options Library ${suffix}`,
      scoringScale: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
      rubric: {
        categories: [
          {
            key: 'daily_habit', label: 'Daily Habit', weight: 0.6,
            description: 'Did the student write today?',
            scoreLabels: [
              { value: 1, label: 'Skipped' },
              { value: 3, label: 'Showed up' },
              { value: 5, label: 'Every day' },
            ],
            feedbackEnabled: false,
          },
          {
            key: 'syntax_and_style', label: 'Syntax And Style', weight: 0.4,
            description: 'Sentences read cleanly.', grammarHighlighting: true,
          },
        ],
      },
      promptConfig: { gradingInstructions: 'Apply the category settings.' },
      outputSchema: { schemaVersion: 1, responseShape: 'categories_overall_comment' },
      calibrationNotes: null,
    };

    try {
      const rubric = await prisma.rubric.create({
        data: { name: schema.name, title: schema.title, schemaJson: schema },
      });
      rubricId = rubric.id;
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

      await expect(page.getByTestId('rubric-add-category')).toHaveCount(0);
      await expect(page.getByTestId('rubric-paste-open')).toHaveCount(0);
      await page.getByTestId('rubric-library-select').click();
      await page.getByRole('option', { name: schema.title, exact: true }).click();

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
        select: { rubricId: true, rubric: { select: { schemaJson: true } } },
      });

      expect(created.rubricId).toBe(rubricId);
      expect(created.rubric?.schemaJson).toEqual(schema);
      expect((created.rubric!.schemaJson as { rubric: unknown }).rubric).toMatchObject({
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
        created.rubric!.schemaJson as { rubric: { categories: Record<string, unknown>[] } }
      ).rubric.categories;
      expect(storedCategories[0]).not.toHaveProperty('grammarHighlighting');
      expect(storedCategories[1]).not.toHaveProperty('feedbackEnabled');
      expect(storedCategories[1]).not.toHaveProperty('scoreLabels');

      // Reopening the saved rubric shows the settings that were stored.
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Edit assignment type' })
      ).toBeVisible();
      await expect(page.getByTestId('rubric-library-select')).toContainText(schema.title);
      await page.getByText(`View ${schema.title}`, { exact: true }).click();
      const visibleSchema = JSON.parse(await page.getByTestId('rubric-library-json').innerText());
      expect(visibleSchema).toEqual(schema);
      expect(visibleSchema.rubric.categories[0].scoreLabels).toEqual([
        { value: 1, label: 'Skipped' },
        { value: 3, label: 'Showed up' },
        { value: 5, label: 'Every day' },
      ]);
      expect(visibleSchema.rubric.categories[0].feedbackEnabled).toBe(false);
      expect(visibleSchema.rubric.categories[0]).not.toHaveProperty('grammarHighlighting');
      expect(visibleSchema.rubric.categories[1].grammarHighlighting).toBe(true);
      expect(visibleSchema.rubric.categories[1]).not.toHaveProperty('feedbackEnabled');
      expect(visibleSchema.rubric.categories[1]).not.toHaveProperty('scoreLabels');
      await expect(page.getByTestId('rubric-add-category')).toHaveCount(0);
      await expect(page.getByTestId('rubric-category-row-0')).toHaveCount(0);
      expect((await prisma.rubric.findUniqueOrThrow({ where: { id: rubricId! } })).schemaJson).toEqual(schema);
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
      if (rubricId) await prisma.rubric.deleteMany({ where: { id: rubricId } });
      await prisma.$disconnect();
    }
  });
});
