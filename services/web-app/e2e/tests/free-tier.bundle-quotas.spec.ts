import { expect, test } from '../test-setup';

const FREE_CLASSROOM_PASSWORD = 'yawp-dev';

test.describe('Free classroom bundle quotas', () => {
  test('teacher sees assignment type counters in the creation sheet', async ({
    page,
    signIn,
  }) => {
    test.setTimeout(120_000);
    const email =
      process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL ??
      'dev.teacher.free@yawp.local';

    await signIn(email, FREE_CLASSROOM_PASSWORD);

    await page.goto('/app/assignments');
    await page.waitForLoadState('networkidle');
    const newAssignment = page.getByRole('button', {
      name: 'New Assignment',
      exact: true,
    });
    await expect(newAssignment).toBeVisible({ timeout: 20_000 });
    await newAssignment.click();
    const sheet = page.locator('[role="dialog"]');
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    const prewritingPicker = sheet.getByRole('button', { name: /Prewriting/i });
    if (await prewritingPicker.count()) {
      await expect(prewritingPicker).toContainText(/\d+ of \d+/);
      await sheet.getByRole('button', { name: /Class Starter/i }).click();
    }
    const typeTrigger = sheet.getByRole('combobox').first();
    await expect(typeTrigger).toBeVisible({ timeout: 20_000 });
    await expect(typeTrigger).not.toContainText(/\d+ of \d+/);
    await typeTrigger.click();
    await expect(
      page.getByRole('option', { name: /Prewriting/i })
    ).toContainText(/\d+ of \d+/);
    await page.keyboard.press('Escape');
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
    await page.getByLabel('Email or handle').fill(email);
    await page.locator('input[type="password"]').fill(FREE_CLASSROOM_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL(
      (url) =>
        url.pathname.startsWith('/app') || url.pathname === '/enter-code',
      { timeout: 15000 }
    );

    await page.goto('/app/my-classes');
    await page.getByRole('button', { name: 'Create Class' }).first().click();
    await expect(page.getByTestId('class-create-blocked-callout')).toBeVisible();
    await expect(
      page.getByText(/Free classroom accounts include one class/i)
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: /^Create Class$/ })
    ).toHaveCount(0);
  });
});
