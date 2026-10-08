import { expect, test } from '@playwright/test';

const FREE_CLASSROOM_PASSWORD = 'yawp-dev';

test.describe('Free classroom bundle quotas', () => {
  test('teacher sees assignment type counters in the creation sheet', async ({
    page,
  }) => {
    const email =
      process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL ??
      'dev.teacher.free@yawp.local';

    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(FREE_CLASSROOM_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL(
      (url) =>
        url.pathname.startsWith('/app') || url.pathname === '/enter-code',
      { timeout: 15000 }
    );
    if (new URL(page.url()).pathname === '/enter-code') {
      throw new Error('Free classroom teacher should not require enter-code in E2E');
    }

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

  test('teacher cannot create a second class from My Classes', async ({
    page,
  }) => {
    const email =
      process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL ??
      'dev.teacher.free@yawp.local';

    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(FREE_CLASSROOM_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL(
      (url) =>
        url.pathname.startsWith('/app') || url.pathname === '/enter-code',
      { timeout: 15000 }
    );

    await page.goto('/app/my-classes');
    await page.getByRole('button', { name: 'Create Class' }).first().click();
    await expect(
      page.getByText(/Free classroom accounts include one class/i)
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: /^Create Class$/ })
    ).toBeDisabled();
  });
});
