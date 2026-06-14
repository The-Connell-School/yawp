import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';

test.describe.serial('Teacher class sorting and filtering', () => {
  test('sorts students and filters assignment rows inside a class', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    const studentEmails = [
      `zoe.${suffix}@yawp.test`,
      `angela.${suffix}@yawp.test`,
      `brian.${suffix}@yawp.test`,
    ];
    let classId: string | null = null;

    try {
      const klass = await prisma.class.create({
        data: {
          code: `SORT-${suffix}`.toUpperCase(),
          schoolYear: '2024-2025',
          period: 'Sorting',
          grade: '9th',
          title: 'Sorting Filter QA',
          schoolId: e2eContext.schoolId,
          teachers: { connect: { id: e2eContext.teacherMembershipId } },
        },
        select: { id: true },
      });
      classId = klass.id;

      const students = [
        { email: studentEmails[0], name: 'Zoe Carter' },
        { email: studentEmails[1], name: 'Ángela Ruiz' },
        { email: studentEmails[2], name: 'Brian Adams' },
      ];

      for (const student of students) {
        const user = await prisma.user.create({
          data: {
            email: student.email,
            name: student.name,
            memberships: {
              create: {
                organizationId: e2eContext.organizationId,
                role: 'STUDENT',
                classesAsStudent: { connect: { id: klass.id } },
              },
            },
          },
        });
        expect(user.id).toBeTruthy();
      }

      for (const assignment of [
        {
          title: 'Zeta Essay',
          prompt: 'Draft a short essay.',
          assignmentTypeId: e2eContext.assignmentTypeId,
        },
        {
          title: 'Alpha Daily Pages',
          prompt: 'Write a daily page.',
          assignmentTypeId: e2eContext.dailyPagesAssignmentTypeId,
        },
        {
          title: 'Beta Essay',
          prompt: 'Draft another short essay.',
          assignmentTypeId: e2eContext.assignmentTypeId,
        },
      ]) {
        await createDeployedAssignment({
          prisma,
          classId: klass.id,
          assignmentTypeId: assignment.assignmentTypeId,
          title: assignment.title,
          prompt: assignment.prompt,
        });
      }

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/my-classes/${klass.id}`);
      await page.waitForLoadState('networkidle');

      const studentsTable = page.getByRole('table', { name: 'Students' });
      const studentHeaders = studentsTable.locator('thead th');
      await expect(studentHeaders).toHaveCount(4);
      for (const header of await studentHeaders.all()) {
        await expect(header).toHaveCSS('white-space', 'nowrap');
      }
      await expect(studentsTable.locator('tbody tr').nth(0)).toContainText(
        'Ángela Ruiz'
      );
      await expect(studentsTable.locator('tbody tr').nth(1)).toContainText(
        'Brian Adams'
      );
      await expect(studentsTable.locator('tbody tr').nth(2)).toContainText(
        'Zoe Carter'
      );

      await page.getByRole('searchbox', { name: /search students/i }).fill('Brian');
      await expect(studentsTable.locator('tbody tr')).toHaveCount(1);
      await expect(studentsTable.locator('tbody tr').first()).toContainText(
        'Brian Adams'
      );

      await page.getByRole('searchbox', { name: /search students/i }).fill('');
      await expect(studentsTable.locator('tbody tr')).toHaveCount(3);

      await studentsTable
        .getByRole('button', { name: /view brian adams's documents/i })
        .click();
      await expect(page).toHaveURL(/tab=documents/);
      await expect(page).toHaveURL(/studentId=/);

      await page.goto(`/app/my-classes/${klass.id}`);
      await page.waitForLoadState('networkidle');

      await page
        .getByRole('button', { name: /sort students by name descending/i })
        .click();
      await expect(studentsTable.locator('tbody tr').nth(0)).toContainText(
        'Zoe Carter'
      );

      // Assignment management now lives on the teacher-level Assignments page,
      // filtered by class and Assignment Type.
      await page.goto(`/app/assignments?class=${klass.id}`);
      await page.waitForLoadState('networkidle');

      const assignmentsTable = page.getByRole('table', {
        name: 'Assignments',
      });
      await expect(assignmentsTable.locator('tbody tr')).toHaveCount(3);
      await expect(assignmentsTable.getByText('Alpha Daily Pages')).toBeVisible();
      await expect(assignmentsTable.getByText('Beta Essay')).toBeVisible();
      await expect(assignmentsTable.getByText('Zeta Essay')).toBeVisible();

      await page.goto(
        `/app/assignments?class=${klass.id}&type=${e2eContext.dailyPagesAssignmentTypeId}`
      );
      await page.waitForLoadState('networkidle');
      await expect(assignmentsTable.locator('tbody tr')).toHaveCount(1);
      await expect(assignmentsTable.locator('tbody tr').first()).toContainText(
        'Alpha Daily Pages'
      );

      await page.getByRole('button', { name: /^clear$/i }).click();
      await expect(assignmentsTable.locator('tbody tr').first()).toBeVisible();
    } finally {
      if (classId) {
        await prisma.assignment.deleteMany({
          where: { classAssignments: { some: { classId } } },
        });
        await prisma.class.delete({ where: { id: classId } }).catch(() => {});
      }
      await prisma.orgMembership.deleteMany({
        where: { user: { email: { in: studentEmails } } },
      });
      await prisma.user.deleteMany({ where: { email: { in: studentEmails } } });
      await prisma.$disconnect();
    }
  });
});
