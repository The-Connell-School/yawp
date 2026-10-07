import { test, expect } from '../test-setup';

test.describe.serial('Daily Pages engagement tiers at 12 points', () => {
  test('creation sheet shows banded grading copy for a 12-point total', async ({
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

    const pointField = page.getByLabel(/Point value/i);
    await pointField.fill('12');
    await expect(pointField).toHaveValue('12');

    await expect(
      page.getByText(/Graded out of 12 points in bands/i)
    ).toBeVisible();
    await expect(page.getByText(/Excellent/i)).toBeVisible();
    await expect(page.getByText(/Good/i)).toBeVisible();
  });
});
