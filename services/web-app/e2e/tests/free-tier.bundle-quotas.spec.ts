import { expect, test } from '../test-setup';

const FREE_CLASSROOM_PASSWORD = 'yawp-dev';

test.describe('Free classroom bundle quotas', () => {
  test('teacher sees assignment type counters in the creation sheet', async ({
    page,
    signIn,
  }) => {
    const email =
      process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL ??
      'dev.teacher.free@yawp.local';
    await signIn(email, FREE_CLASSROOM_PASSWORD);
    await page.goto('/app');
    await page.getByRole('button', { name: /create assignment/i }).click();
    await expect(
      page.locator('[role="combobox"]').filter({ hasText: /\d+ of \d+/ })
    ).toBeVisible();
    const tileTitles = await page
      .getByTestId('teacher-assignments-grid')
      .locator('h3')
      .allTextContents();
    expect(tileTitles.map((title) => title.trim()).sort()).toEqual([
      'Class Starter',
      'Prewriting',
      'Thesis Statement',
    ]);
  });
});
