import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Admin assignment type archive', () => {
  test.setTimeout(60_000);

  test('soft-archives assignment types, hides them from new work, and restores them', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();

    try {
      await prisma.assignmentType.update({
        where: { id: e2eContext.assignmentTypeId },
        data: { archivedAt: null },
      });

      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(`/app/admin/assignment-types/${e2eContext.assignmentTypeId}`);
      await expect(
        page.getByRole('heading', { name: 'Assignment Type Details' })
      ).toBeVisible();

      await page.getByRole('button', { name: 'Archive assignment type' }).click();
      await page.getByRole('button', { name: 'Archive Assignment Type' }).click();
      await page.waitForURL('**/app/admin/assignment-types');

      const archived = await prisma.assignmentType.findUnique({
        where: { id: e2eContext.assignmentTypeId },
        select: { id: true, archivedAt: true },
      });
      expect(archived?.id).toBe(e2eContext.assignmentTypeId);
      expect(archived?.archivedAt).toBeInstanceOf(Date);

      await page.goto(`/app/admin/assignment-types/${e2eContext.assignmentTypeId}`);
      await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();

      await page.context().clearCookies();
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/assignments');
      await expect(
        page.getByRole('heading', { name: 'Assignments' })
      ).toBeVisible();
      // The archived type no longer appears as a browsable type...
      await expect(page.getByRole('link', { name: 'E2E Course' })).toHaveCount(0);
      // ...but existing assignments keep their archived type label.
      await expect(page.getByText('E2E Class Assignment')).toBeVisible();
      await expect(page.getByText('E2E Course').first()).toBeVisible();

      await page
        .getByRole('button', { name: /New Assignment/ })
        .first()
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').locator('[role="combobox"]').first().click();
      await expect(page.getByRole('option', { name: 'E2E Course' })).toHaveCount(0);

      await page.context().clearCookies();
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(`/app/admin/assignment-types/${e2eContext.assignmentTypeId}`);
      await page.getByRole('button', { name: 'Restore' }).click();
      await expect(page.getByRole('button', { name: 'Restore' })).toHaveCount(0);

      const restored = await prisma.assignmentType.findUnique({
        where: { id: e2eContext.assignmentTypeId },
        select: { archivedAt: true },
      });
      expect(restored?.archivedAt).toBeNull();

      await page.context().clearCookies();
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/assignments');
      await expect(page.getByRole('link', { name: 'E2E Course' })).toBeVisible();
    } finally {
      await prisma.assignmentType.update({
        where: { id: e2eContext.assignmentTypeId },
        data: { archivedAt: null },
      });
      await prisma.$disconnect();
    }
  });
});
