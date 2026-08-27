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
    const rubricName = `rubric-assignment-type-e2e-${suffix}`;
    const rubricTitle = `Assignment Type Rubric E2E ${suffix}`;
    let assignmentTypeId: string | null = null;
    let moduleId: string | null = null;

    try {
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
            },
            promptConfig: {
              gradingInstructions:
                'Grade against the rubric categories and give concise, actionable feedback.',
            },
          },
        },
      });

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

      await expect(page.getByTestId('rubric-add-category')).toHaveCount(0);

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
      await page.getByTestId('rubric-library-select').click();
      await page.getByRole('option', { name: rubricTitle }).click();
      await expect(page.getByRole('button', { name: 'Update' })).toBeEnabled();
      await page.getByRole('button', { name: 'Update' }).click();

      await expect
        .poll(async () => {
          const selected = await prisma.assignmentType.findUnique({
            where: { id: assignmentTypeId! },
            select: { rubric: { select: { name: true } } },
          });
          return selected?.rubric?.name;
        })
        .toBe(rubricName);

      const created = await prisma.assignmentType.findUniqueOrThrow({
        where: { id: assignmentTypeId! },
        select: {
          title: true,
          kind: true,
          rubric: { select: { schemaJson: true } },
        },
      });

      expect(created.title).toBe(title);
      expect(created.kind).toBeNull();
      expect(created.rubric?.schemaJson).toMatchObject({
        name: rubricName,
        rubric: {
          categories: [
            { key: 'thesis_e2e', label: 'Thesis E2E', weight: 0.6 },
            { key: 'grammar_e2e', label: 'Grammar E2E', weight: 0.4 },
          ],
        },
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
      await prisma.rubric.deleteMany({ where: { name: rubricName } });
      await prisma.$disconnect();
    }
  });
});
