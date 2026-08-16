import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Admin rubric library', () => {
  test.setTimeout(90_000);

  test('keeps the legacy editor while selecting a shared rubric', async ({
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
          description: 'Proves the existing editor remains available.',
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

      await expect(page.getByTestId('rubric-add-category')).toBeVisible();
      await expect(page.getByTestId('rubric-library-select')).toBeVisible();

      await page.getByTestId('rubric-library-select').click();
      await page
        .getByRole('option', { name: 'Daily Pages engagement' })
        .click();

      await expect
        .poll(async () => {
          const row = await prisma.assignmentType.findUnique({
            where: { id: assignmentTypeId! },
            select: { rubric: { select: { name: true } } },
          });
          return row?.rubric?.name;
        })
        .toBe('daily-pages-engagement');
    } finally {
      if (assignmentTypeId) {
        await prisma.assignmentType.deleteMany({
          where: { id: assignmentTypeId },
        });
      }
      await prisma.$disconnect();
    }
  });

  test('pastes a portable rubric and exposes its categories to modules', async ({
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
      await page.getByTestId('rubric-paste-open').click();
      await page.getByTestId('rubric-paste-json').fill(
        JSON.stringify({
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
        })
      );
      await page.getByTestId('rubric-paste-save').click();

      await expect
        .poll(async () =>
          prisma.rubric.count({ where: { name: rubricName } })
        )
        .toBe(1);

      await page.reload();
      await page.getByTestId('rubric-library-select').click();
      await page.getByRole('option', { name: rubricTitle }).click();

      await expect
        .poll(async () => {
          const row = await prisma.assignmentType.findUnique({
            where: { id: assignmentTypeId! },
            select: { rubric: { select: { name: true } } },
          });
          return row?.rubric?.name;
        })
        .toBe(rubricName);

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
