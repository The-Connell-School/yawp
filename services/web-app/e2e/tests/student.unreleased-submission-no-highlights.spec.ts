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

  test('student can rename submission title in nav', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(
      `/app/submissions/${e2eContext.unreleasedGradedSubmissionId}`
    );
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('submission-title-input');
    await expect(input).toBeVisible();
    await input.fill('E2E student title');
    await input.blur();

    await expect
      .poll(async () => input.inputValue(), { timeout: 10000 })
      .toBe('E2E student title');
  });
});
