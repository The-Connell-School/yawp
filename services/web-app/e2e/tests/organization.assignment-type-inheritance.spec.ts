import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Organization assignment type inheritance', () => {
  test('school customize narrows assignment types visible to teachers', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/organization/schools');
      await page.getByRole('button', { name: 'Edit' }).click();
      await expect(page.getByRole('heading', { name: 'Edit School' })).toBeVisible();

      const manager = page.getByTestId('school-assignment-types-manager');
      await manager.getByLabel('Customize for this school').click();
      await manager
        .getByLabel('Daily Pages')
        .setChecked(false, { force: true });
      await manager
        .getByLabel('AP History Essay')
        .setChecked(false, { force: true });
      await page.getByRole('button', { name: 'Update School' }).click();
      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

      const school = await prisma.school.findUniqueOrThrow({
        where: { id: e2eContext.schoolId },
        include: {
          assignmentTypeAssignments: { select: { assignmentTypeId: true } },
        },
      });
      expect(school.assignmentTypesCustomized).toBe(true);
      expect(school.assignmentTypeAssignments.map((row) => row.assignmentTypeId)).toEqual([
        e2eContext.assignmentTypeId,
      ]);

      await page.goto('/app');
      await expect(page.getByRole('link', { name: 'E2E Course' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Daily Pages' })).toHaveCount(0);
    } finally {
      await prisma.schoolAssignmentType.deleteMany({
        where: { schoolId: e2eContext.schoolId },
      });
      await prisma.school.update({
        where: { id: e2eContext.schoolId },
        data: { assignmentTypesCustomized: false },
      });
      await prisma.$disconnect();
    }
  });

  test('teacher customize narrows assignment types beyond school defaults', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/organization/teachers');
      await page.getByRole('button', { name: 'Edit' }).click();
      await expect(page.getByRole('heading', { name: 'Edit Teacher' })).toBeVisible();

      const manager = page.getByTestId('teacher-assignment-types-manager');
      await manager.getByLabel('Customize for this teacher').click();
      await manager
        .getByLabel('Daily Pages')
        .setChecked(false, { force: true });
      await manager
        .getByLabel('AP History Essay')
        .setChecked(false, { force: true });
      await page.getByRole('button', { name: 'Update Teacher' }).click();
      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

      const teacher = await prisma.orgMembership.findUniqueOrThrow({
        where: { id: e2eContext.teacherMembershipId },
        include: {
          assignmentTypeAssignments: { select: { assignmentTypeId: true } },
        },
      });
      expect(teacher.assignmentTypesCustomized).toBe(true);
      expect(
        teacher.assignmentTypeAssignments.map((row) => row.assignmentTypeId)
      ).toEqual([e2eContext.assignmentTypeId]);

      await page.goto('/app');
      await expect(page.getByRole('link', { name: 'E2E Course' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Daily Pages' })).toHaveCount(0);
    } finally {
      await prisma.teacherAssignmentType.deleteMany({
        where: { membershipId: e2eContext.teacherMembershipId },
      });
      await prisma.orgMembership.update({
        where: { id: e2eContext.teacherMembershipId },
        data: { assignmentTypesCustomized: false },
      });
      await prisma.$disconnect();
    }
  });
});
