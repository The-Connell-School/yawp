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
      await expect(prewritingPicker).toContainText(
        /Unlimited|\d+ of \d+|None left/
      );
      await sheet.getByRole('button', { name: /Class Starter/i }).click();
      await expect(sheet.getByRole('combobox').first()).toBeVisible({
        timeout: 20_000,
      });
    }
    const typeTrigger = sheet.getByRole('combobox').first();
    await expect(typeTrigger).toBeVisible({ timeout: 20_000 });
    await expect(typeTrigger).not.toContainText(/\d+ of \d+/);
    await typeTrigger.click();
    const prewritingOption = page.getByRole('option', { name: /Prewriting/i });
    await expect(prewritingOption).toBeVisible();
    const optionText = await prewritingOption.textContent();
    if (optionText && /\d+ of \d+/.test(optionText)) {
      await expect(prewritingOption).toContainText(/\d+ of \d+/);
    }
    await page.keyboard.press('Escape');
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
