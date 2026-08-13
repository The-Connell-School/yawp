import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { currentSchoolYear } from '../../app/utils/school-year';

/**
 * A returning teacher starts the year clean without anything being archived:
 * the school year scopes what teachers see, and students keep their old work.
 */
test.describe('School year scope', () => {
  test('scopes teacher surfaces to the chosen year and leaves the student alone', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const priorYear = (() => {
      const start = Number(currentSchoolYear().slice(0, 4)) - 1;
      return `${start}-${start + 1}`;
    })();

    // A class from the year that just ended, with the same student on it.
    const lastYearClass = await prisma.class.create({
      data: {
        code: `LY${Date.now().toString().slice(-6)}`,
        schoolYear: priorYear,
        period: '6th',
        grade: '9th',
        schoolId: e2eContext.schoolId,
        teachers: { connect: { id: e2eContext.teacherMembershipId } },
        students: { connect: { id: e2eContext.membershipId } },
      },
      select: { id: true },
    });

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/my-classes');

      // The scope lives with the other global settings, not on the page.
      const openSettings = async () => {
        const control = page.getByTestId('school-year-scope');
        if (await control.isVisible().catch(() => false)) return;
        await page.getByText('Settings', { exact: true }).click();
        await expect(control).toBeVisible();
      };

      await openSettings();
      const scope = page.getByTestId('school-year-scope');
      await expect(scope).toContainText(currentSchoolYear().replace('-', '–'));

      // This year's class is here; last year's is not.
      await expect(
        page.locator(`a[href="/app/my-classes/${e2eContext.classId}"]`)
      ).toBeVisible();
      await expect(
        page.locator(`a[href="/app/my-classes/${lastYearClass.id}"]`)
      ).toHaveCount(0);

      // The dashboard is where a teacher lands, so it obeys the scope too.
      await page.goto('/app');
      await expect(
        page.locator(`a[href="/app/my-classes/${lastYearClass.id}"]`)
      ).toHaveCount(0);
      await page.goto('/app/my-classes');

      // Switching the scope brings the older class back — nothing was archived.
      await openSettings();
      await scope.click();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes('/api/school-year') && response.status() < 400
        ),
        page.getByRole('option', { name: 'All years' }).click(),
      ]);
      await expect(
        page.locator(`a[href="/app/my-classes/${lastYearClass.id}"]`)
      ).toBeVisible();

      // The scope is app-wide: the grading queue reads the same cookie.
      await page.goto('/app/documents');
      await openSettings();
      await expect(page.getByTestId('school-year-scope')).toContainText(
        'All years'
      );

      const currentYearLabel = currentSchoolYear().replace('-', '–');
      await page.getByTestId('school-year-scope').click();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes('/api/school-year') && response.status() < 400
        ),
        page.getByRole('option', { name: currentYearLabel }).click(),
      ]);

      await page.goto('/app/my-classes');
      await expect(
        page.locator(`a[href="/app/my-classes/${lastYearClass.id}"]`)
      ).toHaveCount(0);
    } finally {
      await prisma.class.delete({ where: { id: lastYearClass.id } });
      await prisma.$disconnect();
    }
  });

  test('a student lands on their latest year and can still reach the last one', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const priorYear = (() => {
      const start = Number(currentSchoolYear().slice(0, 4)) - 1;
      return `${start}-${start + 1}`;
    })();

    const lastYearClass = await prisma.class.create({
      data: {
        code: `LS${Date.now().toString().slice(-6)}`,
        schoolYear: priorYear,
        period: '7th',
        grade: '9th',
        schoolId: e2eContext.schoolId,
        teachers: { connect: { id: e2eContext.teacherMembershipId } },
        students: { connect: { id: e2eContext.membershipId } },
      },
      select: { id: true },
    });

    // A piece of the student's work that belongs to last year's class, so the
    // documents page can be checked for the same scoping the class list has.
    const lastYearAssignment = await prisma.classAssignment.create({
      data: {
        classId: lastYearClass.id,
        assignmentId: e2eContext.assignmentId,
      },
      select: { id: true },
    });
    const lastYearDocument = await prisma.document.create({
      data: {
        title: 'Last year essay',
        membership: { connect: { id: e2eContext.membershipId } },
        assignment: { connect: { id: e2eContext.assignmentId } },
        assignmentType: { connect: { id: e2eContext.assignmentTypeId } },
        classAssignment: { connect: { id: lastYearAssignment.id } },
      },
      select: { id: true },
    });

    try {
      await signIn(e2eContext.userEmail, 'johndoe');
      await page.goto('/app/my-classes');

      // No choice was made and none was asked for: this year's class shows.
      await expect(
        page.locator(`a[href="/app/my-classes/${e2eContext.classId}"]`)
      ).toBeVisible();
      await expect(
        page.locator(`a[href="/app/my-classes/${lastYearClass.id}"]`)
      ).toHaveCount(0);

      // The student's work is scoped the same way their classes are.
      await page.goto('/app/my-documents');
      await expect(page.getByText('Last year essay')).toHaveCount(0);

      // Last year is still there for a student who goes looking.
      await page.getByText('Settings', { exact: true }).click();
      const scope = page.getByTestId('school-year-scope');
      await expect(scope).toBeVisible();
      await scope.click();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes('/api/school-year') &&
            response.status() < 400
        ),
        page.getByRole('option', { name: priorYear.replace('-', '–') }).click(),
      ]);

      await page.goto('/app/my-classes');
      await expect(
        page.locator(`a[href="/app/my-classes/${lastYearClass.id}"]`)
      ).toBeVisible();

      // And last year's work comes back with it.
      await page.goto('/app/my-documents');
      await expect(page.getByText('Last year essay')).toBeVisible();
    } finally {
      await prisma.document.delete({ where: { id: lastYearDocument.id } });
      await prisma.classAssignment.delete({
        where: { id: lastYearAssignment.id },
      });
      await prisma.class.delete({ where: { id: lastYearClass.id } });
      await prisma.$disconnect();
    }
  });
});
