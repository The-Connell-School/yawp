import type { Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const OOPS = /Oops! Something didn't work quite right/i;

async function addCompleteRubric(page: Page) {
  await page.getByTestId('rubric-add-category').click();
  await page.getByTestId('rubric-category-row-0').click();
  await page.getByLabel('Label', { exact: true }).fill('Evidence');
  await page.getByLabel('Weight %').fill('100');
  await page.locator('#category-edit-description').fill('Support claims with relevant evidence.');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
}

test.describe('Admin assignment type creator', () => {
  test('create page renders without oops', async ({ page, signIn }) => {
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
    await page.goto('/app/admin/assignment-types/new');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: 'Create assignment type' })
    ).toBeVisible();
    await expect(page.getByText(OOPS)).toHaveCount(0);
  });

  test('validation preserves a new assignment type until its rubric is complete', async ({
    page,
    signIn,
  }) => {
    test.setTimeout(90_000);
    const prisma = createE2EPrismaClient();
    const title = `Creator Validation QA ${Date.now()}`;
    const description = 'Keep this input while correcting the rubric.';
    try {
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto('/app/admin/assignment-types/new');
      await page.locator('input[name="title"]').fill(title);
      await page.getByLabel('Description', { exact: true }).fill(description);
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText(
        'Every rubric category'
      );
      await expect(page.getByText(OOPS)).toHaveCount(0);
      await expect(page.locator('input[name="title"]')).toHaveValue(title);
      await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
        description
      );
      expect(await prisma.assignmentType.count({ where: { title } })).toBe(0);

      await page.getByTestId('rubric-add-category').click();
      await page.getByTestId('rubric-category-row-0').click();
      await page.getByLabel('Label', { exact: true }).fill('Evidence');
      await page.getByLabel('Weight %').fill('100');
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText(
        'Every rubric category'
      );
      await expect(page.getByText(OOPS)).toHaveCount(0);
      await expect(page.locator('input[name="title"]')).toHaveValue(title);
      await expect(page.getByTestId('rubric-category-row-0')).toContainText(
        'Evidence'
      );
      expect(await prisma.assignmentType.count({ where: { title } })).toBe(0);

      await page.getByTestId('rubric-category-row-0').click();
      await page
        .locator('#category-edit-description')
        .fill('Support claims with relevant evidence.');
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Edit assignment type' })
      ).toBeVisible();
      await expect(page.getByText(OOPS)).toHaveCount(0);
      const created = await prisma.assignmentType.findFirstOrThrow({
        where: { title },
      });
      expect(created.description).toBe(description);
      expect(created.rubricJson).toMatchObject({
        categories: [
          {
            label: 'Evidence',
            description: 'Support claims with relevant evidence.',
            weight: 1,
          },
        ],
      });
      await page.reload();
      await expect(page.locator('input[name="title"]')).toHaveValue(title);
    } finally {
      const types = await prisma.assignmentType.findMany({
        where: { title },
        select: { id: true },
      });
      const ids = types.map((row) => row.id);
      await prisma.assignmentModule.deleteMany({
        where: { assignmentTypeId: { in: ids } },
      });
      await prisma.organizationAssignmentType.deleteMany({
        where: { assignmentTypeId: { in: ids } },
      });
      await prisma.assignmentType.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    }
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
      await addCompleteRubric(page);

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

  test('a new assignment type saves its rubric and can then update it', async ({
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
      await addCompleteRubric(page);

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
      await page.getByTestId('rubric-category-row-0').click();
      await page.getByLabel('Label', { exact: true }).fill('Evidence updated');
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Update', exact: true }).click();

      await expect
        .poll(async () => {
          const selected = await prisma.assignmentType.findUnique({
            where: { id: assignmentTypeId! },
            select: { rubricJson: true },
          });
          return (selected?.rubricJson as { categories: Array<{ label: string }> })?.categories[0]?.label;
        })
        .toBe('Evidence updated');
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
      await expect(page.getByTestId('rubric-add-category')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Paste text', exact: true })).toBeVisible();
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

  test('updating basics preserves legacy rubric categories', async ({
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
          gradingAssistantVersion: true,
        },
      });
      expect(updated.rubricJson).toMatchObject(legacyRubric);
      expect(updated.rubricId).toBeNull();
      expect(updated.gradingAssistantVersion).toBe(8);
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
