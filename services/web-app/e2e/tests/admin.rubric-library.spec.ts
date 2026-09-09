import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Admin rubric library', () => {
  test.setTimeout(90_000);

  test('shows a view-only library and selects a shared rubric', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    let assignmentTypeId: string | null = null;

    try {
      const assignmentType = await prisma.assignmentType.create({
        data: {
          title: `Rubric compatibility ${Date.now()}`,
          kind: null,
          description: 'Proves rubric configuration is library-only.',
          position: 0,
          rubricJson: {
            categories: [
              {
                key: 'legacy_category',
                label: 'Legacy category',
                description: 'Existing assignment-type rubric data.',
                weight: 1,
              },
            ],
          },
        },
      });
      assignmentTypeId = assignmentType.id;

      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(`/app/admin/assignment-types/${assignmentTypeId}`);

      await expect(page.getByTestId('rubric-library-select')).toBeVisible();
      await expect(page.getByTestId('rubric-add-category')).toHaveCount(0);
      await expect(page.getByTestId('rubric-paste-open')).toHaveCount(0);

      await page.getByTestId('rubric-library-select').click();
      await page
        .getByRole('option', { name: 'Daily Pages engagement' })
        .click();

      const updateButton = page.getByRole('button', { name: 'Update' });
      await expect(updateButton).toBeEnabled();

      const beforeSave = await prisma.assignmentType.findUnique({
        where: { id: assignmentTypeId },
        select: { rubricId: true },
      });
      expect(beforeSave?.rubricId).toBeNull();

      await updateButton.click();

      await expect
        .poll(async () => {
          const row = await prisma.assignmentType.findUnique({
            where: { id: assignmentTypeId! },
            select: { rubric: { select: { name: true } } },
          });
          return row?.rubric?.name;
        })
        .toBe('daily-pages-engagement');
      // The DB write finishes before loader revalidation hydrates the saved form.
      // Wait for that visible save cycle before starting the next edit.
      await expect(updateButton).toBeVisible();
      await expect(updateButton).toBeDisabled();

      const gradingInstructions =
        'Apply the rubric with extra emphasis on concrete supporting details.';
      const gradingInstructionsField = page.getByLabel(
        'Grading assistant instructions'
      );
      await expect(gradingInstructionsField).toBeVisible();
      await gradingInstructionsField.fill(gradingInstructions);
      await page.getByRole('button', { name: 'Update' }).click();

      await expect
        .poll(async () => {
          const row = await prisma.assignmentType.findUnique({
            where: { id: assignmentTypeId! },
            select: { gradingPromptConfigJson: true },
          });
          return (
            row?.gradingPromptConfigJson as Record<string, unknown> | null
          )?.gradingInstructionsOverride;
        })
        .toBe(gradingInstructions);

      await page.reload();
      await expect(gradingInstructionsField).toHaveValue(gradingInstructions);
    } finally {
      if (assignmentTypeId) {
        await prisma.assignmentType.deleteMany({
          where: { id: assignmentTypeId },
        });
      }
      await prisma.$disconnect();
    }
  });

  test('exposes a selected database rubric as read-only and uses its categories in modules', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now();
    const rubricName = `rubric-e2e-${suffix}`;
    const rubricTitle = `Rubric E2E ${suffix}`;
    let assignmentTypeId: string | null = null;
    let moduleId: string | null = null;

    try {
      const assignmentType = await prisma.assignmentType.create({
        data: {
          title: `Portable rubric type ${suffix}`,
          kind: null,
          description: 'Exercises rubric promotion and module alignment.',
          position: 0,
        },
      });
      assignmentTypeId = assignmentType.id;

      await prisma.rubric.create({
        data: {
          name: rubricName,
          title: rubricTitle,
          schemaJson: {
            name: rubricName,
            title: rubricTitle,
            scoringScale: {
              type: 'weighted_1_5',
              minScore: 1,
              maxScore: 5,
            },
            rubric: {
              categories: [
                {
                  key: 'thesis_e2e',
                  label: 'Thesis E2E',
                  description: 'A clear, defensible thesis.',
                  weight: 0.6,
                },
                {
                  key: 'grammar_e2e',
                  label: 'Grammar E2E',
                  description: 'Grammar and syntax support clarity.',
                  weight: 0.4,
                },
              ],
            },
            promptConfig: {
              gradingInstructions: 'Grade against the portable rubric.',
            },
          },
        },
      });

      const module = await prisma.assignmentModule.create({
        data: {
          assignmentTypeId,
          title: 'Rubric relationships',
          position: 0,
          isSelfGuided: false,
        },
      });
      moduleId = module.id;

      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(`/app/admin/assignment-types/${assignmentTypeId}`);
      await page.getByTestId('rubric-library-select').click();
      await page.getByRole('option', { name: rubricTitle }).click();
      await expect(page.getByRole('button', { name: 'Update' })).toBeEnabled();
      await page.getByRole('button', { name: 'Update' }).click();

      await expect
        .poll(async () => {
          const row = await prisma.assignmentType.findUnique({
            where: { id: assignmentTypeId! },
            select: { rubric: { select: { name: true } } },
          });
          return row?.rubric?.name;
        })
        .toBe(rubricName);

      await page.reload();
      await expect(page.getByText(`View ${rubricTitle}`)).toBeVisible();
      await page.getByText(`View ${rubricTitle}`).click();
      await expect(page.getByTestId('rubric-library-json')).toContainText(
        'thesis_e2e'
      );
      await expect(page.getByTestId('rubric-paste-open')).toHaveCount(0);

      await page.goto(
        `/app/admin/assignment-types/${assignmentTypeId}/modules/${moduleId}`
      );
      await page.getByRole('button', { name: 'Edit Module' }).click();
      await expect(page.getByLabel('Thesis E2E')).toBeVisible();
      await expect(page.getByLabel('Grammar E2E')).toBeVisible();
    } finally {
      if (assignmentTypeId) {
        await prisma.assignmentModule.deleteMany({
          where: { assignmentTypeId },
        });
        await prisma.assignmentType.deleteMany({
          where: { id: assignmentTypeId },
        });
      }
      await prisma.rubric.deleteMany({ where: { name: rubricName } });
      await prisma.$disconnect();
    }
  });
});
