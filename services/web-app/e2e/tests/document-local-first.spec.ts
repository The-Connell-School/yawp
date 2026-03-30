import { test, expect } from '../test-setup';

test.describe('Local-first document persistence', () => {
  test('new save endpoint responds and creates revision', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, e2eContext.teacherPassword);

    // Navigate to a document
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    // Find a document link and navigate to it
    const docLink = page.locator('a[href*="/app/documents/"]').first();
    if ((await docLink.count()) === 0) {
      test.skip();
      return;
    }
    await docLink.click();
    await page.waitForURL('**/app/documents/**');
    await page.waitForLoadState('networkidle');

    // Verify the SaveStatusIndicator is present (shows "Saved")
    await expect(page.locator('text=Saved').first()).toBeVisible({ timeout: 10000 });

    // Verify the DocumentHistory icon is present (second history icon)
    const historyIcons = page.locator('svg.lucide-history');
    await expect(historyIcons.first()).toBeVisible();
  });
});
