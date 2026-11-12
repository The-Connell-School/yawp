import { expect, test } from '../test-setup';

const FREE_CLASSROOM_PASSWORD = 'yawp-dev';

test.describe('Free classroom bundle quotas', () => {
  test('teacher sees assignment type counters on the new assignment page', async ({
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
    await expect(page).toHaveURL(/\/app\/assignments\/new/, {
      timeout: 20_000,
    });
    const typeGrid = page.getByTestId('new-assignment-type-grid');
    await expect(typeGrid).toBeVisible({ timeout: 20_000 });
    const prewritingTile = typeGrid.getByRole('button', { name: /Prewriting/i });
    if (await prewritingTile.count()) {
      await expect(prewritingTile).toContainText(
        /Unlimited|\d+ of \d+|None left/
      );
    }
    const classStarterTile = typeGrid.getByRole('button', {
      name: /Class Starter/i,
    });
    await expect(classStarterTile).toBeVisible({ timeout: 20_000 });
    await expect(classStarterTile).not.toContainText(/\d+ of \d+/);
  });

  test('teacher cannot create a second class from My Classes', async ({
    page,
  }) => {
    const email =
      process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL ??
      'dev.teacher.free@yawp.local';

    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    const { submitUnifiedLogin } = await import('../helpers/unified-login');
    await submitUnifiedLogin(page, email, FREE_CLASSROOM_PASSWORD);
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
