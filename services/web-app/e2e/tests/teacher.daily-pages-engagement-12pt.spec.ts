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

    await page.getByRole('button', { name: 'Change', exact: true }).click();
    const pointField = page.getByLabel(/Point value/i);
    await pointField.fill('12');
    await expect(pointField).toHaveValue('12');
    await expect(page.getByText(/Not Present/i)).toBeVisible();
    await expect(page.getByText(/0.?7/)).toBeVisible();
    await expect(page.getByText(/Needs More/i)).toBeVisible();
    await expect(page.getByText(/8.?9/)).toBeVisible();
    await expect(page.getByText(/^Good$/)).toBeVisible();
    await expect(page.getByText(/\b10\b/).first()).toBeVisible();
    await expect(page.getByText(/Excellent/i)).toBeVisible();
    await expect(page.getByText(/\b12\b/).first()).toBeVisible();
  });
});
