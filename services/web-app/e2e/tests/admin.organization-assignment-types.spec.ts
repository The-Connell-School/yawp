import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Admin organization assignment types', () => {
  test('manages assignment type availability from the organization page', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const title = `Org Managed E2E Type ${Date.now()}`;
    const assignmentType = await prisma.assignmentType.create({
      data: {
        title,
        description: 'Assigned from the organization admin screen.',
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
      await manager
        .locator(`input[name="assignmentTypeIds"][value="${assignmentType.id}"]`)
        .setChecked(true, { force: true });
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
      await page.goto('/app/assignments');
      await expect(page.getByRole('link', { name: title })).toBeVisible();
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
