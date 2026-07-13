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

      await expect(
        page.getByRole('button', { name: 'View compiled prompt' })
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Test prompt' })
      ).toHaveCount(0);

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
        page.getByText('Save prompt changes before running the full suite.')
      ).toBeVisible();
      await page.getByRole('button', { name: 'Cancel' }).click();

      await expect(
        page.getByRole('heading', { name: 'Evaluation history' })
      ).toBeVisible();
      await expect(
        page.getByText(
          'No evaluations yet. Add one to start tracking prompt-version runs.'
        )
      ).toBeVisible();

      await page.getByRole('button', { name: 'Add evaluation' }).click();
      const addEvaluationDialog = page.getByRole('dialog', {
        name: 'Add evaluation',
      });
      await expect(
        addEvaluationDialog.getByLabel('Evaluation name')
      ).toBeVisible();
      await expect(
        addEvaluationDialog.getByLabel('Evaluation description')
      ).toBeVisible();
      await expect(
        addEvaluationDialog.getByLabel('Describe what good looks like')
      ).not.toBeVisible();
      await addEvaluationDialog
        .getByRole('button', { name: 'Generate with AI' })
        .click();
      await addEvaluationDialog
        .getByLabel('Describe what good looks like')
        .fill(
          'Always begin the final feedback with a brief, positive greeting to the student.'
        );
      await addEvaluationDialog
        .getByRole('button', { name: 'Generate evaluations' })
        .click();
      await expect(
        addEvaluationDialog.getByLabel('Evaluation name')
      ).toHaveValue('Positive greeting');
      await expect(
        addEvaluationDialog.getByLabel('Evaluation description')
      ).toHaveValue(
        'Always begin the final feedback with a brief, positive greeting to the student.'
      );
      await expect(
        addEvaluationDialog.getByRole('checkbox', {
          name: 'Use Strong opening',
        })
      ).toBeChecked();
      await expect(
        addEvaluationDialog.getByRole('checkbox', {
          name: 'Use Missing opening',
        })
      ).toBeChecked();
      await addEvaluationDialog
        .getByRole('button', { name: 'Save 2 cases' })
        .click();
      await expect(addEvaluationDialog).not.toBeVisible();

      await expect(page.getByText('1 evaluation · 2 cases')).toBeVisible();
      const historyTable = page.getByRole('table', {
        name: 'Evaluation history',
      });
      await expect(
        historyTable.getByRole('columnheader', { name: 'Positive greeting' })
      ).toBeVisible();

      await historyTable
        .getByRole('button', { name: 'View evaluation Positive greeting' })
        .click();
      const evaluationDialog = page.getByRole('dialog', {
        name: 'Positive greeting',
      });
      await expect(
        evaluationDialog.getByRole('button', { name: 'Edit evaluation' })
      ).toHaveCount(0);
      await expect(evaluationDialog.getByLabel('Evaluation name')).toHaveValue(
        'Positive greeting'
      );
      await evaluationDialog
        .getByLabel('Evaluation name')
        .fill('Encouraging opening');
      await evaluationDialog
        .getByText('Strong opening', { exact: true })
        .click();
      await expect(
        evaluationDialog.getByRole('button', { name: 'Remove case' })
      ).toBeVisible();
      await evaluationDialog
        .getByLabel('Strong opening case name')
        .fill('Clear position');
      await evaluationDialog
        .getByLabel('Strong opening input document')
        .fill(
          'School uniforms should remain optional because student choice matters and narrower policies can address distractions without removing individuality.'
        );
      await evaluationDialog
        .locator('details[open]')
        .getByText('Edit full expected output', { exact: true })
        .click();
      await expect(
        evaluationDialog.getByLabel('Strong opening full expected output')
      ).toBeVisible();
      await evaluationDialog
        .getByRole('button', { name: 'Save changes' })
        .click();
      await expect(evaluationDialog).not.toBeVisible();
      await expect(
        historyTable.getByRole('columnheader', { name: 'Encouraging opening' })
      ).toBeVisible();

      await page.getByRole('button', { name: 'Run all cases' }).click();
      await expect(historyTable.getByRole('row', { name: /v1/ })).toContainText(
        '1/2'
      );
      await expect(
        historyTable.getByLabel('Encouraging opening: 1/2 passed')
      ).toBeVisible();

      await page.getByRole('button', { name: 'Edit instructions' }).click();
      const versionTwoInstructions = page.getByRole('dialog', {
        name: 'Edit instructions',
      });
      await versionTwoInstructions
        .getByLabel('Grading instructions')
        .fill(
          'Grade against the rubric categories, explicitly identify missing thesis statements, and give concise feedback.'
        );
      await versionTwoInstructions
        .getByRole('button', { name: 'Done' })
        .click();
      await page.getByRole('button', { name: 'Update' }).click();
      await expect(page.getByRole('button', { name: 'Update' })).toBeDisabled();

      await page.getByRole('button', { name: 'Run all cases' }).click();
      await expect(historyTable.getByRole('row', { name: /v2/ })).toContainText(
        '2/2'
      );
      await expect(
        historyTable
          .getByLabel('Encouraging opening: 2/2 passed')
          .getByText('2/2')
      ).toHaveAttribute('data-status', 'pass');
      await historyTable
        .getByRole('button', { name: 'View prompt v1' })
        .click();
      const historicalPromptDialog = page.getByRole('dialog', {
        name: 'Prompt v1',
      });
      await expect(
        historicalPromptDialog.getByText(
          'Act as a careful evaluator for this assignment type.'
        )
      ).toBeVisible();
      await historicalPromptDialog
        .getByRole('button', { name: 'Close' })
        .first()
        .click();

      const created = await prisma.assignmentType.findUniqueOrThrow({
        where: { id: assignmentTypeId! },
        select: {
          title: true,
          kind: true,
          rubricJson: true,
          scoringScaleJson: true,
          gradingPromptConfigJson: true,
          evaluations: {
            select: {
              title: true,
              cases: {
                orderBy: { position: 'asc' },
                select: { title: true, documentText: true },
              },
            },
          },
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
          'Grade against the rubric categories, explicitly identify missing thesis statements, and give concise feedback.',
      });
      expect(created.evaluations).toEqual([
        expect.objectContaining({
          title: 'Encouraging opening',
          cases: [
            expect.objectContaining({
              title: 'Clear position',
              documentText: expect.stringContaining(
                'without removing individuality'
              ),
            }),
            expect.objectContaining({ title: 'Missing opening' }),
          ],
        }),
      ]);

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
