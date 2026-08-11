import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Admin organization assignment types', () => {
  test('manages assignment type availability from the organization page', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const title = `Organization-managed writing assignment type with a deliberately long title ${Date.now()}`;
    const description =
      'This deliberately long assignment type description should wrap inside the organization edit sheet instead of overflowing or being cut off with an ellipsis.';
    const assignmentType = await prisma.assignmentType.create({
      data: {
        title,
        description,
        position: -1,
      },
      select: { id: true },
    });

    try {
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(`/app/admin/organizations/${e2eContext.organizationId}`);
      await page.getByRole('button', { name: 'Edit Organization' }).click();
      await expect(
        page.getByRole('heading', { name: 'Edit Organization' })
      ).toBeVisible();
      await page.waitForTimeout(750);

      const manager = page.getByTestId('organization-assignment-types-manager');
      await expect(manager).toBeVisible();
      const assignmentTypeInput = manager.locator(
        `input[name="assignmentTypeIds"][value="${assignmentType.id}"]`
      );
      const assignmentTypeRow = assignmentTypeInput.locator('..');
      const titleText = assignmentTypeRow.getByText(title, { exact: true });
      const descriptionText = assignmentTypeRow.getByText(description, {
        exact: true,
      });

      await expect(titleText).toBeVisible();
      await expect(descriptionText).toBeVisible();
      await expect(titleText).not.toHaveCSS('text-overflow', 'ellipsis');
      await expect(descriptionText).not.toHaveCSS('text-overflow', 'ellipsis');
      expect(
        await assignmentTypeRow.evaluate((row) =>
          Math.ceil(row.scrollWidth) <= Math.ceil(row.clientWidth)
        )
      ).toBe(true);

      await assignmentTypeInput.setChecked(true, { force: true });
      await page.getByRole('button', { name: 'Save Changes' }).click();
      await expect(
        page.getByRole('button', { name: 'Edit Organization' })
      ).toBeVisible();

      const assignment = await prisma.organizationAssignmentType.findUnique({
        where: {
          organizationId_assignmentTypeId: {
            organizationId: e2eContext.organizationId,
            assignmentTypeId: assignmentType.id,
          },
        },
      });
      expect(assignment).not.toBeNull();

      await page.context().clearCookies();
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);
      await page
        .getByRole('button', { name: /New Assignment/ })
        .first()
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').locator('[role="combobox"]').first().click();
      await expect(page.getByRole('option', { name: title })).toBeVisible();
    } finally {
      await prisma.organizationAssignmentType.deleteMany({
        where: { assignmentTypeId: assignmentType.id },
      });
      await prisma.assignmentType.deleteMany({
        where: { id: assignmentType.id },
      });
      await prisma.$disconnect();
    }
  });
});
