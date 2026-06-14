import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createTeacherClassPilotFixture } from '../db-helpers';

test.describe.serial('Admin teacher assignment type controls', () => {
  test('enables an org-hidden assignment type for one teacher only', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = `${Date.now()}`;
    const title = `Teacher Control E2E Type ${suffix}`;

    const assignmentType = await prisma.assignmentType.create({
      data: {
        title,
        description:
          'Visible only through teacher-level assignment type access.',
        position: -1,
        assignmentModules: {
          create: {
            title: 'Teacher Control Module',
            position: 1,
            instructions: {
              create: {
                title: 'Write',
                prompt: 'Write a short response.',
                position: 1,
              },
            },
          },
        },
      },
      select: { id: true },
    });

    const peerTeacher = await createTeacherClassPilotFixture({
      prisma,
      organizationId: e2eContext.organizationId,
      schoolId: e2eContext.schoolId,
      assignmentTypeId: assignmentType.id,
      suffix: `assignment-type-access-${suffix}`,
    });

    try {
      await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
      await page.goto(`/app/admin/assignment-types/${assignmentType.id}`);

      const manager = page.getByTestId(
        'teacher-assignment-type-access-manager'
      );
      await expect(manager).toBeVisible();
      const teacherRow = manager.getByRole('row', {
        name: new RegExp(e2eContext.teacherEmail),
      });
      await expect(teacherRow).toContainText('No access');
      await teacherRow.getByRole('button', { name: 'Enable' }).click();

      await expect
        .poll(async () => {
          const target = await prisma.featureAccessTarget.findUnique({
            where: {
              featureKey_targetKind_targetId: {
                featureKey: `assignment_type:${assignmentType.id}`,
                targetKind: 'teacher',
                targetId: e2eContext.teacherMembershipId,
              },
            },
            select: { enabled: true },
          });
          return target?.enabled;
        })
        .toBe(true);

      await page.context().clearCookies();
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app');
      await expect(page.getByRole('link', { name: title })).toBeVisible();

      const createdAssignmentTitle = `Teacher Control Created ${suffix}`;
      const createdAssignmentPrompt = `Teacher Control prompt ${suffix}`;
      await page.getByRole('button', { name: 'Create Assignment' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').locator('[role="combobox"]').click();
      await expect(page.getByRole('option', { name: title })).toBeVisible();
      await page.getByRole('option', { name: title }).click();
      await page.getByLabel(/Grade 9th .* Period 1st/).check();
      await page.getByLabel('Title (optional)').fill(createdAssignmentTitle);
      await page.getByLabel('Prompt').fill(createdAssignmentPrompt);
      await page.getByRole('button', { name: 'Create Assignment' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(
        page
          .getByTestId('teacher-assignments-list')
          .getByText(createdAssignmentTitle)
      ).toBeVisible();

      await expect
        .poll(async () => {
          const deployment = await prisma.classAssignment.findFirst({
            where: {
              classId: e2eContext.classId,
              assignment: {
                assignmentTypeId: assignmentType.id,
                title: createdAssignmentTitle,
                prompt: createdAssignmentPrompt,
              },
            },
            select: { id: true },
          });
          return Boolean(deployment);
        })
        .toBe(true);

      await page.context().clearCookies();
      await signIn(peerTeacher.teacherEmail, peerTeacher.teacherPassword);
      await page.goto('/app');
      await expect(page.getByRole('link', { name: title })).toHaveCount(0);
      await expect(
        page.getByText(`Non-pilot assignment assignment-type-access-${suffix}`)
      ).toBeVisible();
      await page.getByRole('button', { name: 'Create Assignment' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').locator('[role="combobox"]').click();
      await expect(page.getByRole('option', { name: title })).toHaveCount(0);
    } finally {
      await prisma.featureAccessTarget.deleteMany({
        where: { featureKey: `assignment_type:${assignmentType.id}` },
      });
      await prisma.submission.deleteMany({
        where: { document: { assignmentTypeId: assignmentType.id } },
      });
      await prisma.document.deleteMany({
        where: { assignmentTypeId: assignmentType.id },
      });
      await prisma.assignment.deleteMany({
        where: { assignmentTypeId: assignmentType.id },
      });
      await prisma.assignmentType.deleteMany({
        where: { id: assignmentType.id },
      });
      await prisma.class.deleteMany({
        where: { id: peerTeacher.classId },
      });
      const fixtureEmails = [
        peerTeacher.teacherEmail,
        peerTeacher.studentEmail,
      ];
      await prisma.orgMembership.deleteMany({
        where: {
          user: {
            email: {
              in: fixtureEmails,
            },
          },
        },
      });
      await prisma.user.deleteMany({
        where: {
          email: {
            in: fixtureEmails,
          },
        },
      });
      await prisma.$disconnect();
    }
  });
});
