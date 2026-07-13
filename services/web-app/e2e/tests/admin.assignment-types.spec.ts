import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Admin assignment types', () => {
  test.setTimeout(90_000);

  test('creates an assignment type with rubric settings and maps module rubric relationships', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now();
    const title = `Rubric E2E Type ${suffix}`;
    let assignmentTypeId: string | null = null;
    let moduleId: string | null = null;

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
        .fill('Created by the assignment type rubric e2e test.');

      await page.getByTestId('rubric-add-category').click();
      await page.getByTestId('rubric-add-category').click();

      await page.getByTestId('rubric-category-row-0').click();
      await page.getByLabel('Label', { exact: true }).fill('Thesis E2E');
      await page.getByLabel('Weight %').fill('60');
      await page
        .locator('#category-edit-description')
        .fill('Clear, defensible thesis for the essay.');
      await page.getByRole('button', { name: 'Done' }).click();

      await page.getByTestId('rubric-category-row-1').click();
      await page.getByLabel('Label', { exact: true }).fill('Grammar E2E');
      await page.getByLabel('Weight %').fill('40');
      await page
        .locator('#category-edit-description')
        .fill('Grammar and syntax support clarity.');
      await page.getByRole('button', { name: 'Done' }).click();

      await page.getByRole('button', { name: 'Edit instructions' }).click();
      const editInstructionsDialog = page.getByRole('dialog', {
        name: 'Edit instructions',
      });
      await expect(editInstructionsDialog).toBeVisible();
      await editInstructionsDialog
        .getByLabel('Custom system instructions')
        .fill('Act as a careful evaluator for this assignment type.');
      await editInstructionsDialog
        .getByLabel('Grading instructions')
        .fill(
          'Grade against the rubric categories and give concise, actionable feedback.'
        );
      await editInstructionsDialog
        .getByRole('button', { name: 'Done' })
        .click();

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

      await expect(page.locator('input[name="title"]')).toHaveValue(title);
      await expect(
        page.getByRole('heading', { name: 'Edit assignment type' })
      ).toBeVisible();
      await expect(page.getByText('Grading instructions')).not.toBeVisible();

      await page.getByRole('button', { name: 'View compiled prompt' }).click();
      const compiledPromptDialog = page.getByRole('dialog', {
        name: 'Compiled prompt',
      });
      await expect(compiledPromptDialog).toBeVisible();
      await expect(
        compiledPromptDialog.getByText('System message')
      ).toBeVisible();
      await expect(
        compiledPromptDialog.getByText('User message')
      ).toBeVisible();
      await expect(
        compiledPromptDialog.getByText('You are a grading assistant.')
      ).toBeVisible();
      await expect(
        compiledPromptDialog.getByText(
          'Act as a careful evaluator for this assignment type.'
        )
      ).toBeVisible();
      await expect(compiledPromptDialog.getByText(title)).toBeVisible();
      await expect(
        compiledPromptDialog.getByText(
          'Grade against the rubric categories and give concise, actionable feedback.'
        )
      ).toBeVisible();
      await expect(
        compiledPromptDialog.getByText('[CASE DOCUMENT CONTENT]')
      ).toBeVisible();
      await expect(compiledPromptDialog.getByText('Version')).toBeVisible();
      await expect(
        compiledPromptDialog.getByText('Intermediate', { exact: true })
      ).toBeVisible();
      await compiledPromptDialog.getByRole('button', { name: 'Close' }).click();

      await page.getByRole('button', { name: 'Test prompt' }).click();
      const testPromptDialog = page.getByRole('dialog', {
        name: 'Test prompt',
      });
      await testPromptDialog
        .getByLabel('Case document')
        .fill('School uniforms should remain optional.');
      await testPromptDialog
        .getByLabel('Evaluation criterion')
        .fill(
          'The feedback should identify the thesis and give one grounded next step.'
        );
      await testPromptDialog.getByRole('button', { name: 'Run test' }).click();
      await expect(
        testPromptDialog.getByText('Pass', { exact: true })
      ).toBeVisible();
      await expect(
        testPromptDialog.getByText('Jordan, make the stakes more explicit.')
      ).toBeVisible();
      await expect(
        testPromptDialog.getByText(
          'The response identifies the thesis and gives a grounded next step.'
        )
      ).toBeVisible();
      await testPromptDialog.getByRole('button', { name: 'Close' }).click();

      await page.getByRole('button', { name: 'Edit instructions' }).click();
      await page
        .getByRole('dialog', { name: 'Edit instructions' })
        .getByLabel('Grading instructions')
        .fill('This unsaved instruction must not appear as production-ready.');
      await page
        .getByRole('dialog', { name: 'Edit instructions' })
        .getByRole('button', { name: 'Done' })
        .click();
      await expect(
        page.getByRole('button', { name: 'View compiled prompt' })
      ).toBeDisabled();
      await expect(
        page.getByText('Save changes to preview the updated prompt.')
      ).toBeVisible();
      await page.getByRole('button', { name: 'Cancel' }).click();

      const created = await prisma.assignmentType.findUniqueOrThrow({
        where: { id: assignmentTypeId! },
        select: {
          title: true,
          kind: true,
          rubricJson: true,
          scoringScaleJson: true,
          gradingPromptConfigJson: true,
        },
      });

      expect(created.title).toBe(title);
      expect(created.kind).toBeNull();
      expect(created.scoringScaleJson).toMatchObject({
        type: 'weighted_1_5',
        minScore: 1,
        maxScore: 5,
      });
      expect(created.rubricJson).toMatchObject({
        categories: [
          {
            key: 'thesis_e2e',
            label: 'Thesis E2E',
            weight: 0.6,
            description: 'Clear, defensible thesis for the essay.',
          },
          {
            key: 'grammar_e2e',
            label: 'Grammar E2E',
            weight: 0.4,
            description: 'Grammar and syntax support clarity.',
          },
        ],
      });
      expect(created.gradingPromptConfigJson).toMatchObject({
        systemInstructions:
          'Act as a careful evaluator for this assignment type.',
        gradingInstructions:
          'Grade against the rubric categories and give concise, actionable feedback.',
      });

      await page.getByRole('button', { name: 'Add module' }).click();
      await page.locator('#moduleTitle').fill('Thesis planning');
      await page
        .locator('#moduleDescription')
        .fill('Module focused on thesis planning.');
      await page
        .locator('#tutorInstructions')
        .fill('Coach students toward a defensible thesis.');
      await page.getByRole('button', { name: 'Create module' }).click();
      await expect(page.getByRole('link', { name: 'View' })).toBeVisible();

      const createdModule = await prisma.assignmentModule.findFirstOrThrow({
        where: {
          assignmentTypeId: assignmentTypeId!,
          title: 'Thesis planning',
        },
        select: { id: true },
      });
      moduleId = createdModule.id;

      await page.getByRole('link', { name: 'View' }).click();
      await expect(
        page.getByRole('heading', { name: 'Module Details' })
      ).toBeVisible();

      await page.getByRole('button', { name: 'Edit Module' }).click();
      await expect(page.getByText('Rubric relationships')).toBeVisible();
      await page.getByLabel('Thesis E2E').selectOption('primary');
      await page.getByLabel('Grammar E2E').selectOption('supporting');
      await page.getByRole('button', { name: 'Save Changes' }).click();

      await expect(
        page.getByRole('button', { name: 'Edit Module' })
      ).toBeVisible();

      const updatedModule = await prisma.assignmentModule.findUniqueOrThrow({
        where: { id: moduleId },
        select: { rubricAlignmentJson: true },
      });

      expect(updatedModule.rubricAlignmentJson).toMatchObject({
        thesis_e2e: 'primary',
        grammar_e2e: 'supporting',
      });
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
