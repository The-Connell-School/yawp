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

  test('a student still sees a class from a previous year', async ({
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

    try {
      await signIn(e2eContext.userEmail, 'johndoe');
      await page.goto('/app/my-classes');

      // The year scope is a teacher tool; a student's own work never moves.
      await page.getByText('Settings', { exact: true }).click();
      await expect(page.getByTestId('school-year-scope')).toHaveCount(0);
      await expect(
        page.locator(`a[href="/app/my-classes/${lastYearClass.id}"]`)
      ).toBeVisible();
    } finally {
      await prisma.class.delete({ where: { id: lastYearClass.id } });
      await prisma.$disconnect();
    }
  });
});
