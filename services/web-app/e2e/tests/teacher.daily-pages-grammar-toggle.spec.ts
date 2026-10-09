import { test, expect } from '../test-setup';

/**
 * The teacher's per-assignment answer to "is this one graded for grammar and
 * syntax". It is only offered for assignment types whose rubric grades grammar
 * at all, because it only ever turns grammar grading off.
 */
test.describe.serial('Grammar grading toggle at assignment creation', () => {
  test('Daily Pages never offers grammar grading on the engagement rubric', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await expect(
      page.getByLabel('Grade this for grammar and syntax')
    ).toHaveCount(0);
  });

  test('Class Starter never offers it, because it never grades grammar', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await expect(
      page.getByLabel('Grade this for grammar and syntax')
    ).toHaveCount(0);
  });
});
