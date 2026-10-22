import { test, expect } from '@playwright/test';

test.describe('Yawp! developer side panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post('/auth/dev-login', {
      form: { email: 'dev.teacher@yawp.local', redirectTo: '/app/assignments' },
    });
  });

  test('opens from beaker, persists across reload, and closes clearing storage', async ({
    page,
  }) => {
    await page.goto('/app/assignments');
    await page.getByRole('button', { name: 'Open developer tools' }).click();
    await expect(page.getByRole('complementary', { name: 'Developer tools' })).toBeVisible();
    await page.getByLabel('Note').fill('Draft note kept across reload');
    await page.getByRole('button', { name: 'Give feedback' }).click();
    await expect(page.getByRole('dialog', { name: 'Give feedback' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('complementary', { name: 'Developer tools' })).toBeVisible();
    await expect(page.getByLabel('Note')).toHaveValue('Draft note kept across reload');
    await page.getByRole('button', { name: 'Close developer tools' }).click();
    const stored = await page.evaluate(() =>
      localStorage.getItem('yawp-dev-panel')
    );
    expect(stored).toBeNull();
  });

  test('Alt+Shift+D toggles the panel', async ({ page }) => {
    await page.goto('/app/assignments');
    await page.keyboard.press('Alt+Shift+D');
    await expect(page.getByRole('complementary', { name: 'Developer tools' })).toBeVisible();
    await page.keyboard.press('Alt+Shift+D');
    await expect(
      page.getByRole('complementary', { name: 'Developer tools' })
    ).toHaveCount(0);
  });

  test('blackboard launch without access code does not open JSON error page', async ({
    page,
    context,
  }) => {
    await page.context().clearCookies();
    await page.goto('/app/assignments');
    const response = await page.request.get('/dev/blackboard-lti-mock/');
    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/json');
    await page.getByRole('button', { name: 'Open developer tools' }).click();
    const popupPromise = context.waitForEvent('page', { timeout: 2000 }).catch(() => null);
    await page.getByRole('button', { name: 'Open Blackboard' }).click();
    const popup = await popupPromise;
    expect(popup).toBeNull();
  });

  test('corrupt storage starts closed', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('yawp-dev-panel', '{bad');
    });
    await page.goto('/app/assignments');
    await expect(
      page.getByRole('complementary', { name: 'Developer tools' })
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open developer tools' })).toBeVisible();
  });
});
