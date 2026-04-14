import { test, expect } from '../test-setup';

test.describe.serial('Student view before grade release', () => {
  test('does not show inline comment highlights until grade is released', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(
      `/app/submissions/${e2eContext.unreleasedGradedSubmissionId}`
    );
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('nav').getByText('Submitted', { exact: true })
    ).toBeVisible();
    await expect(page.locator('nav').getByText('Graded')).toHaveCount(0);
    await expect(page.locator('.grade-comment-mark')).toHaveCount(0);
  });
});
