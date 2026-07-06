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

      await page
        .getByPlaceholder(
          'Tell the AI how to grade this assignment. Include scoring rules, tone, and how to interpret each rubric category.'
        )
        .fill(
          'Grade against the rubric categories and give concise, actionable feedback.'
        );

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

      const workbenchPath = `/app/admin/assignment-types/${assignmentTypeId}/ai-workbench`;
      await page.goto(workbenchPath);
      await expect(
        page.getByRole('heading', { name: `Test assignment type: ${title}` })
      ).toBeVisible();
      await expect(page.getByText('Sandbox launch')).toBeVisible();
      await expect(page.getByText('Tutor test', { exact: true })).toHaveCount(
        0
      );
      await expect(
        page.getByText('Grading test', { exact: true })
      ).toHaveCount(0);
      await expect(page.getByText('System prompt')).toHaveCount(0);
      await expect(page.getByText('User prompt')).toHaveCount(0);

      await page.getByLabel('Student name').fill('Ava');
      await page
        .getByLabel('Test document')
        .fill('This thesis draft makes a specific claim about the text.');
      await page.getByLabel('Strictness').selectOption('advanced');
      await page.getByLabel('Test name').fill('E2E real tutor sandbox');
      await Promise.all([
        page.waitForURL(
          (url) =>
            url.pathname.startsWith('/app/documents/') &&
            url.searchParams.has('aiWorkbenchRunId'),
          { timeout: 15_000 }
        ),
        page.getByRole('button', { name: 'Open tutor test' }).click(),
      ]);

      const tutorUrl = new URL(page.url());
      const tutorDocumentId = tutorUrl.pathname.split('/').pop();
      expect(tutorDocumentId).toBeTruthy();
      expect(tutorUrl.searchParams.get('exitTo')).toBe(workbenchPath);
      await expect(page.getByTestId('ai-sandbox-banner')).toBeVisible();
      await expect(page.getByTestId('document-title-input')).toHaveValue(
        `AI sandbox: ${title}`
      );
      await expect(
        page
          .getByText('This thesis draft makes a specific claim about the text.')
          .first()
      ).toBeVisible();
      await expect(page.getByText('Grade Summary')).toHaveCount(0);

      await page.goto(workbenchPath);
      await page.getByLabel('Student name').fill('Ava');
      await page
        .getByLabel('Test document')
        .fill('This thesis draft makes a specific claim about the text.');
      await page.getByLabel('Strictness').selectOption('advanced');
      await page.getByLabel('Test name').fill('E2E real grading sandbox');
      await Promise.all([
        page.waitForURL(
          (url) =>
            url.pathname.startsWith('/app/submissions/') &&
            url.searchParams.get('edit') === '1' &&
            url.searchParams.has('aiWorkbenchRunId'),
          { timeout: 15_000 }
        ),
        page.getByRole('button', { name: 'Open grading test' }).click(),
      ]);

      const gradingUrl = new URL(page.url());
      const gradingSubmissionId = gradingUrl.pathname.split('/').pop();
      expect(gradingSubmissionId).toBeTruthy();
      expect(gradingUrl.searchParams.get('exitTo')).toBe(workbenchPath);
      await expect(page.getByTestId('ai-sandbox-banner')).toBeVisible();
      await expect(page.getByText('Grade Summary')).toBeVisible();
      await expect(page.getByTestId('grading-assistant-generate')).toBeVisible();
      await expect(page.getByText('Thesis E2E', { exact: true })).toBeVisible();
      await expect(
        page
          .getByText('This thesis draft makes a specific claim about the text.')
          .first()
      ).toBeVisible();

      const tutorRun = await prisma.assignmentTypeAiEvaluationRun.findFirstOrThrow({
        where: {
          assignmentTypeId: assignmentTypeId!,
          label: 'E2E real tutor sandbox',
        },
        select: {
          agentKind: true,
          status: true,
          studentFirstName: true,
          strictnessLevel: true,
          sampleInput: true,
          resultJson: true,
          sandboxDocument: {
            select: {
              id: true,
              title: true,
              text: true,
              isAiSandbox: true,
            },
          },
          sandboxSubmission: {
            select: {
              id: true,
            },
          },
        },
      });

      expect(tutorRun.agentKind).toBe('workbench-real-page-sandbox');
      expect(tutorRun.status).toBe('open');
      expect(tutorRun.studentFirstName).toBe('Ava');
      expect(tutorRun.strictnessLevel).toBe('advanced');
      expect(tutorRun.sampleInput).toContain('specific claim');
      expect(tutorRun.sandboxDocument).toMatchObject({
        id: tutorDocumentId,
        title: `AI sandbox: ${title}`,
        isAiSandbox: true,
      });
      expect(tutorRun.sandboxSubmission).toBeNull();
      expect(tutorRun.resultJson).toMatchObject({
        mode: 'real-page-sandbox',
        launchMode: 'tutor',
        documentId: tutorDocumentId,
        submissionId: null,
      });

      const gradingRun = await prisma.assignmentTypeAiEvaluationRun.findFirstOrThrow({
        where: {
          assignmentTypeId: assignmentTypeId!,
          label: 'E2E real grading sandbox',
        },
        select: {
          agentKind: true,
          status: true,
          studentFirstName: true,
          strictnessLevel: true,
          sampleInput: true,
          resultJson: true,
          sandboxDocument: {
            select: {
              id: true,
              title: true,
              text: true,
              isAiSandbox: true,
            },
          },
          sandboxSubmission: {
            select: {
              id: true,
              title: true,
              text: true,
              isAiSandbox: true,
              document: {
                select: {
                  id: true,
                  isAiSandbox: true,
                },
              },
            },
          },
        },
      });

      expect(gradingRun.agentKind).toBe('workbench-real-page-sandbox');
      expect(gradingRun.status).toBe('open');
      expect(gradingRun.studentFirstName).toBe('Ava');
      expect(gradingRun.strictnessLevel).toBe('advanced');
      expect(gradingRun.sampleInput).toContain('specific claim');
      expect(gradingRun.sandboxDocument).toMatchObject({
        title: `AI sandbox: ${title}`,
        isAiSandbox: true,
      });
      expect(gradingRun.sandboxSubmission).toMatchObject({
        id: gradingSubmissionId,
        title: `AI sandbox: ${title}`,
        isAiSandbox: true,
        text: expect.stringContaining('specific claim'),
        document: {
          isAiSandbox: true,
        },
      });
      expect(gradingRun.resultJson).toMatchObject({
        mode: 'real-page-sandbox',
        launchMode: 'grading',
        documentId: gradingRun.sandboxDocument?.id,
        submissionId: gradingSubmissionId,
      });
    } finally {
      if (assignmentTypeId) {
        await prisma.submission.deleteMany({
          where: { document: { assignmentTypeId } },
        });
        await prisma.document.deleteMany({
          where: { assignmentTypeId },
        });
        await prisma.assignmentTypeAiEvaluationRun.deleteMany({
          where: { assignmentTypeId },
        });
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
