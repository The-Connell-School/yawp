import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const OOPS = /Oops! Something didn't work quite right/i;

test.describe('Admin assignment type creator', () => {
  test('creation keeps the library rubric and instructions through title validation and reopening', async ({ page, signIn }) => {
    test.setTimeout(90_000);
    const prisma = createE2EPrismaClient();
    const title = `Creator Selected Rubric QA ${Date.now()}`;
    const instructions = 'Reward concrete supporting details for this assignment.';
    try {
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto('/app/admin/assignment-types/new');
      // The loader seeds the canonical protected library before we capture it.
      const rubric = await prisma.rubric.findUniqueOrThrow({ where: { name: 'daily-pages-engagement' } });
      await expect(page.getByTestId('rubric-add-category')).toHaveCount(0);
      await expect(page.getByTestId('rubric-paste-open')).toHaveCount(0);
      await page.getByTestId('rubric-library-select').click();
      await page.getByRole('option', { name: rubric.title, exact: true }).click();
      await page.getByTestId('grading-assistant-instructions').fill(instructions);
      await page.locator('input[name="title"]').fill('   ');
      const rejected = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/app/admin/assignment-types/new.data'));
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      expect((await rejected).status()).toBe(400);
      await expect(page.getByRole('alert')).toContainText('Title is required');
      await expect(page.getByText(OOPS)).toHaveCount(0);
      await expect(page.getByTestId('rubric-library-select')).toContainText(rubric.title);
      await expect(page.getByTestId('grading-assistant-instructions')).toHaveValue(instructions);
      await page.locator('input[name="title"]').fill(title);
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Edit assignment type' })).toBeVisible();
      const created = await prisma.assignmentType.findFirstOrThrow({ where: { title }, include: { rubric: true } });
      expect(created.rubricId).toBe(rubric.id);
      expect(created.rubric?.schemaJson).toEqual(rubric.schemaJson);
      expect(created.gradingPromptConfigJson).toMatchObject({ gradingInstructionsOverride: instructions });
      await page.reload();
      await expect(page.getByTestId('rubric-library-select')).toContainText(rubric.title);
      await expect(page.getByTestId('grading-assistant-instructions')).toHaveValue(instructions);
      await page.getByText(`View ${rubric.title}`, { exact: true }).click();
      await expect(page.getByTestId('rubric-library-json')).toContainText('daily-pages-engagement');
      await page.getByRole('link', { name: 'Prompt', exact: true }).click();
      await expect(page.getByRole('button', { name: 'View compiled prompt', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Test prompt', exact: true })).toBeVisible();
      await page.goto(`/app/admin/assignment-types/${created.id}`);
      await expect(page.getByTestId('rubric-library-select')).toContainText(rubric.title);
      await page.getByTestId('rubric-library-select').click();
      await page.getByRole('option', { name: 'Built-in default for this assignment type', exact: true }).click();
      await page.getByTestId('grading-assistant-instructions').fill('Discard these unsaved instructions.');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByTestId('rubric-library-select')).toContainText(rubric.title);
      await expect(page.getByTestId('grading-assistant-instructions')).toHaveValue(instructions);
      await page.getByTestId('rubric-library-select').click();
      await page.getByRole('option', { name: 'Built-in default for this assignment type', exact: true }).click();
      const cleared = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/app/admin/assignment-types/${created.id}.data`));
      await page.getByRole('button', { name: 'Update', exact: true }).click();
      expect((await cleared).ok()).toBe(true);
      await page.reload();
      await expect(page.getByTestId('rubric-library-select')).toContainText('Built-in default for this assignment type');
      await expect(page.getByTestId('grading-assistant-instructions')).toHaveValue(instructions);
      expect((await prisma.assignmentType.findUniqueOrThrow({ where: { id: created.id } })).rubricId).toBeNull();
      await expect(page.getByTestId('rubric-add-category')).toHaveCount(0);
    } finally {
      const types = await prisma.assignmentType.findMany({ where: { title }, select: { id: true } });
      const ids = types.map((row) => row.id);
      await prisma.assignmentModule.deleteMany({ where: { assignmentTypeId: { in: ids } } });
      await prisma.organizationAssignmentType.deleteMany({ where: { assignmentTypeId: { in: ids } } });
      await prisma.assignmentType.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    }
  });

  test('create page renders without oops', async ({ page, signIn }) => {
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
    await page.goto('/app/admin/assignment-types/new');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: 'Create assignment type' })
    ).toBeVisible();
    await expect(page.getByText(OOPS)).toHaveCount(0);
  });

  test('saving a new assignment type must not show the oops screen', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const title = `Creator QA ${Date.now()}`;
    let assignmentTypeId: string | null = null;

    try {
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto('/app/admin/assignment-types/new');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(OOPS)).toHaveCount(0);

      await page.getByLabel('Title').fill(title);
      await page
        .getByLabel('Description')
        .fill('Minimal assignment type creator QA test.');

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

      await expect(page.getByText(OOPS)).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Edit assignment type' })
      ).toBeVisible();
      await expect(page.locator('input[name="title"]')).toHaveValue(title);

      const created = await prisma.assignmentType.findUniqueOrThrow({
        where: { id: assignmentTypeId! },
        select: { title: true, kind: true, rubricId: true },
      });
      expect(created.title).toBe(title);
      expect(created.kind).toBeNull();
      expect(created.rubricId).toBeNull();
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

  test('a new assignment type saves first and can then choose a library rubric', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const title = `Creator Rubric QA ${Date.now()}`;
    let assignmentTypeId: string | null = null;

    try {
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto('/app/admin/assignment-types/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Title').fill(title);
      await expect(page.getByTestId('rubric-add-category')).toHaveCount(0);
      await expect(page.getByTestId('rubric-library-select')).toBeVisible();

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
      await expect(page.getByText(OOPS)).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Edit assignment type' })
      ).toBeVisible();
      await page.getByTestId('rubric-library-select').click();
      await page
        .getByRole('option', { name: 'Daily Pages engagement' })
        .click();
      await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Update', exact: true }).click();

      await expect
        .poll(async () => {
          const selected = await prisma.assignmentType.findUnique({
            where: { id: assignmentTypeId! },
            select: { rubric: { select: { name: true } } },
          });
          return selected?.rubric?.name;
        })
        .toBe('daily-pages-engagement');
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

  test('updating an assignment type from the detail page must not oops', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const title = `Creator Update QA ${Date.now()}`;
    let assignmentTypeId: string | null = null;

    try {
      const created = await prisma.assignmentType.create({
        data: {
          title,
          kind: null,
          description: 'Seed for update QA',
          position: 0,
          scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
          rubricJson: { categories: [] },
        },
      });
      assignmentTypeId = created.id;

      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(`/app/admin/assignment-types/${assignmentTypeId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('rubric-library-select')).toBeVisible();
      await expect(page.getByTestId('rubric-add-category')).toHaveCount(0);
      await expect(page.getByTestId('rubric-paste-open')).toHaveCount(0);
      await expect(page.getByText(OOPS)).toHaveCount(0);

      await page.locator('input[name="title"]').fill(`${title} Updated`);
      await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeEnabled();
      const updateResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response
            .url()
            .includes(`/app/admin/assignment-types/${assignmentTypeId}.data`)
      );
      await page.getByRole('button', { name: 'Update', exact: true }).click();
      expect((await updateResponse).ok()).toBe(true);
      await expect
        .poll(async () => {
          const updated = await prisma.assignmentType.findUnique({
            where: { id: assignmentTypeId! },
            select: { title: true },
          });
          return updated?.title;
        })
        .toBe(`${title} Updated`);

      await expect(page.getByText(OOPS)).toHaveCount(0);
      await expect(page.locator('input[name="title"]')).toHaveValue(
        `${title} Updated`
      );
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

  test('updating basics leaves legacy rubric configuration unchanged', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const title = `Creator Sheet Open QA ${Date.now()}`;
    let assignmentTypeId: string | null = null;

    try {
      const legacyRubric = {
        categories: [
          {
            key: 'legacy_category',
            label: 'Legacy category',
            description: 'Existing assignment-type rubric data.',
            weight: 1,
          },
        ],
      };
      const created = await prisma.assignmentType.create({
        data: {
          title,
          kind: null,
          description: 'Legacy rubric preservation QA',
          position: 0,
          rubricJson: legacyRubric,
          scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
          gradingPromptConfigJson: { gradingInstructions: 'Keep the legacy prompt exactly.', legacyExtra: 'preserve' },
          gradingOutputSchemaJson: { schemaVersion: 1, responseShape: 'categories_overall_comment', legacyExtra: true },
          gradingCalibrationNotes: 'Keep legacy calibration.',
          gradingAssistantVersion: 7,
        },
      });
      assignmentTypeId = created.id;

      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(`/app/admin/assignment-types/${assignmentTypeId}`);
      await page.locator('input[name="title"]').fill(`${title} Updated`);
      const saved = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/app/admin/assignment-types/${assignmentTypeId}.data`));
      await page.getByRole('button', { name: 'Update', exact: true }).click();
      expect((await saved).ok()).toBe(true);

      await expect(page.getByText(OOPS)).toHaveCount(0);
      await expect(page.locator('input[name="title"]')).toHaveValue(
        `${title} Updated`
      );

      const updated = await prisma.assignmentType.findUniqueOrThrow({
        where: { id: assignmentTypeId },
        select: {
          rubricJson: true,
          rubricId: true,
          scoringScaleJson: true,
          gradingPromptConfigJson: true,
          gradingOutputSchemaJson: true,
          gradingCalibrationNotes: true,
          gradingAssistantVersion: true,
        },
      });
      expect(updated.rubricJson).toEqual(legacyRubric);
      expect(updated.scoringScaleJson).toEqual(created.scoringScaleJson);
      expect(updated.gradingPromptConfigJson).toEqual(created.gradingPromptConfigJson);
      expect(updated.gradingOutputSchemaJson).toEqual(created.gradingOutputSchemaJson);
      expect(updated.gradingCalibrationNotes).toBe(created.gradingCalibrationNotes);
      expect(updated.rubricId).toBeNull();
      expect(updated.gradingAssistantVersion).toBe(7);
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
