import { test, expect } from '@playwright/test';

test.describe('Basic App Functionality', () => {
  test('should load the homepage', async ({ page }) => {
    // Test that the app can start and basic routing works
    await page.goto('/');

    // Since this is likely a protected app, we might get redirected to login
    // or see a login page, which is expected behavior
    await page.waitForLoadState('networkidle');

    // Check that we get some response (either login page or app page)
    const title = await page.title();
    expect(title).toBeTruthy();

    // Check that the page loaded without major errors
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
  });

  test('should handle navigation to auth routes', async ({ page }) => {
    // Test that authentication routes are accessible
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    // Should see some form of login interface
    const emailInputs = await page.locator('input[type="email"]').count();
    const passwordInputs = await page.locator('input[type="password"]').count();
    const loginText = await page.getByText(/login|sign/i).count();
    const hasLoginContent = emailInputs + passwordInputs + loginText;
    expect(hasLoginContent).toBeGreaterThan(0);
  });

  test('should show appropriate response for protected routes', async ({
    page,
  }) => {
    // Test that protected routes redirect appropriately when not authenticated
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    // Should either show login page or redirect to auth
    const currentUrl = page.url();
    const hasAuthIndicators =
      (await page.getByText(/login|sign/i).count()) > 0 ||
      (await page.locator('input[type="email"]').count()) > 0 ||
      (await page.locator('input[type="password"]').count()) > 0;

    const isProtectedBehavior =
      currentUrl.includes('/auth') ||
      currentUrl.includes('/login') ||
      hasAuthIndicators;

    expect(isProtectedBehavior).toBe(true);
  });
});
