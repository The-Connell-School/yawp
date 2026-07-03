import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Organization assignment type inheritance', () => {
  test('owner can assign teacher lounge trainings to a teacher', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();

    try {
      await prisma.orgMembership.update({
        where: { id: e2eContext.teacherMembershipId },
        data: { assignedTeacherTrainings: { set: [] } },
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/organization/teachers');

      const teacherRow = page.getByRole('row', {
        name: new RegExp(
          `${e2eContext.teacherName}.*${e2eContext.teacherEmail}`
        ),
      });
      await teacherRow.getByRole('button', { name: 'Edit' }).click();
      await expect(
        page.getByRole('heading', { name: 'Edit Teacher' })
      ).toBeVisible();

      const trainingCheckbox = page.locator(
        `#teacher-training-${e2eContext.teacherTrainingId}`
      );
      await expect(trainingCheckbox).toHaveAttribute('aria-checked', 'false');
      await trainingCheckbox.evaluate((node) =>
        (node as HTMLButtonElement).click()
      );
      await expect(trainingCheckbox).toHaveAttribute('aria-checked', 'true');

      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/app/organization/teachers.data') &&
          response.request().method() === 'POST'
      );
      await page.getByRole('button', { name: 'Update Teacher' }).click();
      const saveResponse = await saveResponsePromise;

      expect(saveResponse.status()).toBeLessThan(400);
      await expect(
        page.getByText("Oops! Something didn't work quite right.")
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Edit' }).first()
      ).toBeVisible();

      const teacher = await prisma.orgMembership.findUniqueOrThrow({
        where: { id: e2eContext.teacherMembershipId },
        include: {
          assignedTeacherTrainings: { select: { id: true } },
        },
      });
      expect(
        teacher.assignedTeacherTrainings.map((course) => course.id)
      ).toEqual([e2eContext.teacherTrainingId]);
    } finally {
      await prisma.orgMembership.update({
        where: { id: e2eContext.teacherMembershipId },
        data: { assignedTeacherTrainings: { set: [] } },
      });
      await prisma.$disconnect();
    }
  });

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
      await expect(
        page.getByRole('heading', { name: 'Edit School' })
      ).toBeVisible();

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
      expect(
        school.assignmentTypeAssignments.map((row) => row.assignmentTypeId)
      ).toEqual([e2eContext.assignmentTypeId]);

      await page.goto('/app');
      await expect(
        page.getByRole('link', { name: 'E2E Course' })
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Daily Pages' })).toHaveCount(
        0
      );
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
      const teacherRow = page.getByRole('row', {
        name: new RegExp(
          `${e2eContext.teacherName}.*${e2eContext.teacherEmail}`
        ),
      });
      await teacherRow.getByRole('button', { name: 'Edit' }).click();
      await expect(
        page.getByRole('heading', { name: 'Edit Teacher' })
      ).toBeVisible();

      const manager = page.getByTestId('teacher-assignment-types-manager');
      await manager.getByLabel('Customize for this teacher').click();
      await manager
        .getByLabel('Daily Pages')
        .setChecked(false, { force: true });
      await manager
        .getByLabel('AP History Essay')
        .setChecked(false, { force: true });
      await page.getByRole('button', { name: 'Update Teacher' }).click();
      await expect(
        teacherRow.getByRole('button', { name: 'Edit' })
      ).toBeVisible();

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
      await expect(
        page.getByRole('link', { name: 'E2E Course' })
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Daily Pages' })).toHaveCount(
        0
      );
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
