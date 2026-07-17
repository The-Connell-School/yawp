import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { formatPromptDate } from '~/domain/ai-evaluation/assignment-type-evaluation.shared';

const todayPromptDate = formatPromptDate(new Date().toISOString());

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
      await expect(
        page.getByRole('button', { name: 'Edit instructions' })
      ).toHaveCount(0);

      await expect(
        page.getByRole('heading', { name: 'Evaluation history' })
      ).toHaveCount(0);
      const promptLink = page.getByRole('link', {
        name: 'Prompt',
        exact: true,
      });
      await expect(promptLink).toBeVisible();
      await expect(promptLink).toHaveAttribute(
        'href',
        `/app/admin/assignment-types/${assignmentTypeId}/prompt`
      );
      await promptLink.click();
      await expect(page).toHaveURL(
        `/app/admin/assignment-types/${assignmentTypeId}/prompt`
      );
      await expect(
        page.getByRole('heading', { name: 'Prompts', exact: true })
      ).toBeVisible();
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Back to assignment type' })
      ).toBeVisible();
      await expect(page.getByText('Production', { exact: true })).toBeVisible();
      await page.getByRole('button').filter({ hasText: 'Production' }).click();
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
        addEvaluationDialog.getByRole('button', { name: 'Generate' })
      ).toBeDisabled();

      await addEvaluationDialog
        .getByLabel('Evaluation name')
        .fill('Positive greeting');
      await addEvaluationDialog
        .getByLabel('Evaluation description')
        .fill(
          'Always begin the final feedback with a brief, positive greeting to the student.'
        );
      await expect(
        addEvaluationDialog.getByRole('button', { name: 'Generate' })
      ).toBeEnabled();

      await addEvaluationDialog
        .getByRole('button', { name: 'Generate' })
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
      const evaluationPanel = page.getByRole('complementary', {
        name: 'Evaluation details',
      });
      await expect(
        evaluationPanel.getByRole('button', { name: 'Edit evaluation' })
      ).toHaveCount(0);
      await expect(evaluationPanel.getByLabel('Evaluation name')).toHaveValue(
        'Positive greeting'
      );
      await evaluationPanel
        .getByLabel('Evaluation name')
        .fill('Encouraging opening');
      await evaluationPanel
        .getByText('Strong opening', { exact: true })
        .click();
      await expect(
        evaluationPanel.getByRole('button', { name: 'Remove case' })
      ).toBeVisible();
      await evaluationPanel
        .getByLabel('Strong opening case name')
        .fill('Clear position');
      await evaluationPanel
        .getByLabel('Strong opening input document')
        .fill(
          'School uniforms should remain optional because student choice matters and narrower policies can address distractions without removing individuality.'
        );
      await evaluationPanel
        .getByText('Edit full expected output', { exact: true })
        .click();
      await expect(
        evaluationPanel.getByLabel('Strong opening full expected output')
      ).toBeVisible();
      await evaluationPanel
        .getByRole('button', { name: 'Save changes' })
        .click();
      await expect(
        historyTable.getByRole('columnheader', { name: 'Encouraging opening' })
      ).toBeVisible();
      await expect(page.getByText('Suite v1', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Run all cases' }).click();
      await expect(historyTable.getByRole('row', { name: /v1/ })).toContainText(
        '1/2'
      );
      await expect(
        historyTable.getByLabel('Encouraging opening: 1/2 Partial')
      ).toBeVisible();
      await historyTable.getByLabel('Encouraging opening: 1/2 Partial').click();
      const resultPanel = page.getByRole('complementary', {
        name: 'Evaluation details',
      });
      await expect(resultPanel.getByText('1/2')).toBeVisible();
      await expect(resultPanel.getByText('Pass')).toBeVisible();
      await expect(resultPanel.getByText('Fail')).toBeVisible();
      const failedCaseResult = resultPanel
        .getByTestId('evaluation-case-result')
        .filter({ hasText: 'Missing opening' });
      await expect(
        failedCaseResult.getByRole('tab', { name: 'Expected output' })
      ).toBeVisible();
      await expect(
        failedCaseResult.getByRole('tab', { name: 'Actual output' })
      ).toBeVisible();
      await expect(failedCaseResult).toContainText(
        'The first prompt version misses the saved evaluation criterion.'
      );
      await failedCaseResult
        .getByRole('tab', { name: 'Actual output' })
        .click();
      await expect(failedCaseResult).toContainText(
        'Jordan, make the stakes more explicit.'
      );
      await resultPanel.getByRole('button', { name: 'Close details' }).click();

      await page.getByRole('button', { name: 'Create draft' }).click();
      await expect(
        page.getByRole('heading', {
          name: `Prompt ${todayPromptDate} B`,
          exact: true,
        })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Edit prompt' }).click();
      const versionTwoPrompt = page.getByRole('dialog', {
        name: `Edit prompt ${todayPromptDate} B`,
      });
      await versionTwoPrompt
        .getByLabel('System message template')
        .fill('Grade {{assignment_type}} work carefully.');
      await versionTwoPrompt
        .getByLabel('User message template')
        .fill('Rubric:\n{{rubric}}\n\nStudent work:\n{{document}}');
      await versionTwoPrompt
        .getByRole('button', { name: 'Save prompt' })
        .click();
      await page.getByRole('button', { name: 'Run all cases' }).click();
      await expect(historyTable.getByRole('row', { name: /v2/ })).toContainText(
        '2/2'
      );
      await expect(
        historyTable
          .getByLabel('Encouraging opening: 2/2 Pass')
          .getByText('2/2')
      ).toHaveAttribute('data-status', 'pass');
      await page
        .getByRole('button', { name: 'Back to prompt versions' })
        .click();
      await page.getByRole('link', { name: 'Back to assignment type' }).click();
      await expect(
        page.getByRole('heading', { name: 'Edit assignment type' })
      ).toBeVisible();

      const created = await prisma.assignmentType.findUniqueOrThrow({
        where: { id: assignmentTypeId! },
        select: {
          title: true,
          kind: true,
          rubricJson: true,
          scoringScaleJson: true,
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

  test('versions prompts and evaluation suites before promoting a draft', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const assignmentType = await prisma.assignmentType.create({
      data: {
        title: `Prompt versions E2E ${Date.now()}`,
        description: 'Exercises prompt and evaluation-suite version control.',
        position: 9_999,
        scoringScaleJson: {
          type: 'weighted_1_5',
          minScore: 1,
          maxScore: 5,
        },
        rubricJson: {
          categories: [
            {
              key: 'thesis',
              label: 'Thesis',
              description: 'Makes a clear, defensible claim.',
              weight: 1,
            },
          ],
        },
        gradingPromptConfigJson: {
          gradingInstructions: 'Give concise, rubric-grounded feedback.',
        },
        gradingOutputSchemaJson: {
          responseShape: 'categories_overall_comment',
          schemaVersion: 1,
        },
      },
    });
    const seededEvaluation = await prisma.assignmentTypeEvaluation.create({
      data: {
        assignmentTypeId: assignmentType.id,
        title: 'Encouraging opening',
        description: 'Begin with specific encouragement.',
        position: 0,
        cases: {
          create: [
            {
              assignmentTypeId: assignmentType.id,
              title: 'Positive opening',
              documentText: 'School uniforms should remain optional.',
              criterion: 'Begin with specific encouragement.',
              rubricCategoryKey: 'thesis',
              expectedOutputJson: {
                categories: [
                  {
                    key: 'thesis',
                    score: 4,
                    comment: 'The position is clear.',
                  },
                ],
                overallComment: 'Jordan, your position is clear.',
              },
              position: 0,
            },
            {
              assignmentTypeId: assignmentType.id,
              title: 'Missing opening',
              documentText: 'Uniforms can reduce distractions.',
              criterion:
                'Begin with specific encouragement. [fixture:improves-after-v1]',
              rubricCategoryKey: 'thesis',
              expectedOutputJson: {
                categories: [
                  {
                    key: 'thesis',
                    score: 4,
                    comment: 'The position is present.',
                  },
                ],
                overallComment: 'Jordan, make the stakes more explicit.',
              },
              position: 1,
            },
          ],
        },
      },
      include: { cases: { orderBy: { position: 'asc' } } },
    });
    await prisma.assignmentTypeEvaluationRun.create({
      data: {
        assignmentTypeId: assignmentType.id,
        promptVersion: 1,
        promptSnapshotJson: { legacy: true },
        status: 'completed',
        totalCases: 2,
        passedCases: 1,
        failedCases: 1,
        completedAt: new Date(),
        results: {
          create: seededEvaluation.cases.map((evaluationCase, index) => ({
            caseId: evaluationCase.id,
            caseTitle: evaluationCase.title,
            rubricCategoryKey: evaluationCase.rubricCategoryKey,
            criterion: evaluationCase.criterion,
            status: index === 0 ? 'pass' : 'fail',
            evidence: 'Legacy result preserved for migration coverage.',
          })),
        },
      },
    });

    try {
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(
        `/app/admin/assignment-types/${assignmentType.id}/prompt`
      );

      await expect(
        page.getByRole('heading', { name: 'Prompts', exact: true })
      ).toBeVisible();
      await expect(page.getByText('Production', { exact: true })).toBeVisible();
      await page.getByRole('button').filter({ hasText: 'Production' }).click();
      await expect(
        page.getByRole('heading', {
          name: `Prompt ${todayPromptDate}`,
          exact: true,
        })
      ).toBeVisible();
      await expect(page.getByText('Suite v1', { exact: true })).toBeVisible();
      await expect(
        page
          .getByRole('table', { name: 'Evaluation history' })
          .getByRole('row', { name: /v1/ })
      ).toContainText('1/2');

      await page.getByRole('button', { name: 'Create draft' }).click();
      await expect(
        page.getByRole('heading', {
          name: `Prompt ${todayPromptDate} B`,
          exact: true,
        })
      ).toBeVisible();
      await expect(page.getByText('Draft', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Edit prompt' }).click();
      const promptDialog = page.getByRole('dialog', {
        name: `Edit prompt ${todayPromptDate} B`,
      });
      await promptDialog
        .getByLabel('System message template')
        .fill(
          'You are the production grading assistant for {{assignment_type}}.'
        );
      await promptDialog
        .getByLabel('User message template')
        .fill('Use this rubric:\n{{rubric}}\n\nStudent work:\n{{document}}');
      await promptDialog.getByRole('button', { name: 'Save prompt' }).click();

      const historyTable = page.getByRole('table', {
        name: 'Evaluation history',
      });
      await historyTable
        .getByRole('button', { name: 'View evaluation Encouraging opening' })
        .click();
      const evaluationPanel = page.getByRole('complementary', {
        name: 'Evaluation details',
      });
      await evaluationPanel
        .getByLabel('Evaluation name')
        .fill('Encouraging feedback');
      await evaluationPanel
        .getByRole('button', { name: 'Save changes' })
        .click();

      await expect(page.getByText('Suite v2', { exact: true })).toBeVisible();
      await expect(
        historyTable.getByText(
          'No runs for this prompt and evaluation suite yet.'
        )
      ).toBeVisible();

      await page.getByRole('button', { name: 'Run all cases' }).click();
      await expect(historyTable.getByRole('row', { name: /v2/ })).toContainText(
        '2/2'
      );
      await page.getByRole('button', { name: 'Promote to production' }).click();
      await page
        .getByRole('alertdialog', {
          name: `Promote prompt ${todayPromptDate} B?`,
        })
        .getByRole('button', { name: 'Promote' })
        .click();
      await expect(page.getByText('Production', { exact: true })).toBeVisible();

      const promoted = await prisma.assignmentType.findUniqueOrThrow({
        where: { id: assignmentType.id },
        select: {
          gradingAssistantVersion: true,
          gradingPromptConfigJson: true,
          promptVersions: {
            orderBy: { version: 'asc' },
            select: { version: true, revision: true, status: true },
          },
          evaluationSuiteVersions: {
            orderBy: { version: 'asc' },
            select: { version: true },
          },
        },
      });
      expect(promoted.gradingAssistantVersion).toBe(2);
      expect(promoted.gradingPromptConfigJson).toMatchObject({
        systemMessageTemplate:
          'You are the production grading assistant for {{assignment_type}}.',
      });
      expect(promoted.promptVersions).toEqual([
        { version: 1, revision: 1, status: 'previous' },
        { version: 2, revision: 2, status: 'production' },
      ]);
      expect(promoted.evaluationSuiteVersions).toEqual([
        { version: 1 },
        { version: 2 },
      ]);
    } finally {
      await prisma.assignmentType.delete({ where: { id: assignmentType.id } });
      await prisma.$disconnect();
    }
  });

  test('copies evaluations and full suites from another assignment type', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now();
    const rubricJson = {
      categories: [
        {
          key: 'thesis',
          label: 'Thesis',
          description: 'Makes a clear, defensible claim.',
          weight: 1,
        },
      ],
    };
    const scoringScaleJson = {
      type: 'weighted_1_5',
      minScore: 1,
      maxScore: 5,
    };
    const sourceAssignmentType = await prisma.assignmentType.create({
      data: {
        title: `Copy source E2E ${suffix}`,
        description: 'Provides reusable evaluation fixtures.',
        position: 9_997,
        rubricJson,
        scoringScaleJson,
      },
    });
    const targetAssignmentType = await prisma.assignmentType.create({
      data: {
        title: `Copy target E2E ${suffix}`,
        description: 'Receives copied evaluation fixtures.',
        position: 9_998,
        rubricJson,
        scoringScaleJson,
      },
    });
    const sourceEvaluations = await Promise.all(
      [
        {
          title: 'Specific encouragement',
          description: 'Begin with document-specific encouragement.',
          caseTitle: 'Clear position',
          documentText: 'School uniforms should remain optional.',
          overallComment: 'Jordan, your position is clear.',
        },
        {
          title: 'Actionable next step',
          description: 'End with one concrete next step.',
          caseTitle: 'Missing evidence',
          documentText: 'Uniforms can help schools.',
          overallComment: 'Add one example that supports your claim.',
        },
      ].map((fixture, position) =>
        prisma.assignmentTypeEvaluation.create({
          data: {
            assignmentTypeId: sourceAssignmentType.id,
            title: fixture.title,
            description: fixture.description,
            position,
            cases: {
              create: {
                assignmentTypeId: sourceAssignmentType.id,
                title: fixture.caseTitle,
                documentText: fixture.documentText,
                criterion: fixture.description,
                rubricCategoryKey: 'thesis',
                expectedOutputJson: {
                  categories: [
                    {
                      key: 'thesis',
                      score: 4,
                      comment: 'The position is clear.',
                    },
                  ],
                  overallComment: fixture.overallComment,
                },
                position: 0,
              },
            },
          },
          include: { cases: true },
        })
      )
    );
    await prisma.assignmentTypeEvaluationSuiteVersion.create({
      data: {
        assignmentTypeId: sourceAssignmentType.id,
        version: 1,
        contentHash: `copy-source-${suffix}`,
        snapshotJson: {
          evaluations: sourceEvaluations.map((evaluation) => ({
            id: evaluation.id,
            title: evaluation.title,
            description: evaluation.description,
            position: evaluation.position,
            cases: evaluation.cases.map((evaluationCase) => ({
              id: evaluationCase.id,
              evaluationId: evaluation.id,
              title: evaluationCase.title,
              rubricCategoryKey: evaluationCase.rubricCategoryKey,
              documentText: evaluationCase.documentText,
              criterion: evaluationCase.criterion,
              expectedOutputJson: evaluationCase.expectedOutputJson,
              position: evaluationCase.position,
            })),
          })),
          legacyCases: [],
        },
      },
    });

    try {
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(
        `/app/admin/assignment-types/${targetAssignmentType.id}/prompt`
      );
      await page.getByRole('button').filter({ hasText: 'Production' }).click();
      await expect(page.getByText('Suite v1', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Add evaluation' }).click();
      let addEvaluationDialog = page.getByRole('dialog', {
        name: 'Add evaluation',
      });
      await addEvaluationDialog
        .getByRole('button', { name: 'Copy from another suite' })
        .click();
      await addEvaluationDialog.getByLabel('Source assignment type').click();
      await page
        .getByRole('option', { name: sourceAssignmentType.title })
        .click();
      await addEvaluationDialog.getByLabel('Source evaluation suite').click();
      await page.getByRole('option', { name: 'Suite v1' }).click();
      await addEvaluationDialog
        .getByRole('button', {
          name: 'Copy evaluation Specific encouragement',
        })
        .click();
      await expect(addEvaluationDialog).not.toBeVisible();
      await expect(
        page
          .getByRole('table', { name: 'Evaluation history' })
          .getByRole('columnheader', { name: 'Specific encouragement' })
      ).toBeVisible();
      await expect(page.getByText('Suite v1', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Add evaluation' }).click();
      addEvaluationDialog = page.getByRole('dialog', {
        name: 'Add evaluation',
      });
      await addEvaluationDialog
        .getByRole('button', { name: 'Copy from another suite' })
        .click();
      await addEvaluationDialog.getByLabel('Source assignment type').click();
      await page
        .getByRole('option', { name: sourceAssignmentType.title })
        .click();
      await addEvaluationDialog.getByLabel('Source evaluation suite').click();
      await page.getByRole('option', { name: 'Suite v1' }).click();
      await addEvaluationDialog
        .getByRole('button', { name: 'Copy entire suite' })
        .click();
      await expect(addEvaluationDialog).not.toBeVisible();
      await expect(
        page
          .getByRole('table', { name: 'Evaluation history' })
          .getByRole('columnheader', { name: 'Actionable next step' })
      ).toBeVisible();
      await expect(page.getByText('Suite v1', { exact: true })).toBeVisible();

      const saved = await prisma.assignmentType.findUniqueOrThrow({
        where: { id: targetAssignmentType.id },
        select: {
          evaluations: { select: { title: true } },
          evaluationSuiteVersions: {
            orderBy: { version: 'asc' },
            select: { version: true },
          },
        },
      });
      expect(saved.evaluations.map((evaluation) => evaluation.title)).toEqual(
        expect.arrayContaining([
          'Specific encouragement',
          'Actionable next step',
        ])
      );
      expect(saved.evaluationSuiteVersions).toEqual([{ version: 1 }]);
    } finally {
      await prisma.assignmentType.deleteMany({
        where: {
          id: {
            in: [sourceAssignmentType.id, targetAssignmentType.id],
          },
        },
      });
      await prisma.$disconnect();
    }
  });
});
