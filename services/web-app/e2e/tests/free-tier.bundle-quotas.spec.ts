import { expect, test } from '@playwright/test';

test.describe('Free classroom bundle quotas', () => {
  test('teacher sees assignment type counters in the creation sheet', async ({
    page,
  }) => {
    const email =
      process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL ??
      'dev.teacher.free@yawp.local';
    const login = await page.request.post('/auth/dev-login', {
      form: { email },
      maxRedirects: 0,
    });
    expect(login.ok()).toBeTruthy();
    await page.goto('/app');
    await page
      .getByRole('button', { name: /new assignment|create assignment/i })
      .first()
      .click();
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
