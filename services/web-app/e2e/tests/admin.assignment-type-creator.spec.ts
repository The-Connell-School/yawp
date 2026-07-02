import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const OOPS = /Oops! Something didn't work quite right/i;

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
        select: { title: true, kind: true },
      });
      expect(created.title).toBe(title);
      expect(created.kind).toBeNull();
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

  test('saving with rubric categories must not show the oops screen', async ({
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
      await page.getByTestId('rubric-add-category').click();
      await page.getByTestId('rubric-category-row-0').click();
      await expect(page.getByRole('heading', { name: 'Edit category' })).toBeVisible();
      await page.getByLabel('Label', { exact: true }).fill('Thesis');
      await page.getByLabel('Weight %').fill('100');
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByRole('heading', { name: 'Edit category' })).toHaveCount(0);

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
      await expect(page.getByTestId('rubric-category-row-0')).toContainText('Thesis');
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
      await expect(page.getByText(OOPS)).toHaveCount(0);

      await page.locator('input[name="title"]').fill(`${title} Updated`);
      await expect(page.getByRole('button', { name: 'Update' })).toBeEnabled();
      await page.getByRole('button', { name: 'Update' }).click();
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(OOPS)).toHaveCount(0);
      await expect(page.locator('input[name="title"]')).toHaveValue(`${title} Updated`);
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

  test('save works even when category edit sheet was opened', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const title = `Creator Sheet Open QA ${Date.now()}`;
    let assignmentTypeId: string | null = null;

    try {
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto('/app/admin/assignment-types/new');
      await page.getByLabel('Title').fill(title);
      await page.getByTestId('rubric-add-category').click();
      await page.getByTestId('rubric-category-row-0').click();
      await expect(page.getByRole('heading', { name: 'Edit category' })).toBeVisible();

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
