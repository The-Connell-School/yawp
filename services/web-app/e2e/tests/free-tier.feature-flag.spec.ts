import { expect, test } from '../test-setup';
import { setFreeTierFlag } from '../feature-flags';

test.describe.serial('Free tier feature flag', () => {
  test.afterAll(async () => {
    await setFreeTierFlag(true);
  });

  test('returns 404 for /free when the flag is off', async ({ page }) => {
    await setFreeTierFlag(false);
    const response = await page.goto('/free');
    expect(response?.status()).toBe(404);
  });

  test('onboarding waitlist works when the flag is on', async ({ page }) => {
    await setFreeTierFlag(true);
    await page.goto('/free');
    await expect(page.getByRole('heading', { name: /Try YAWP/i })).toBeVisible();
    await page.fill('input[name="name"]', 'Flag E2E');
    await page.fill('input[name="email"]', `e2e-flag+${Date.now()}@yawp.local`);
    await page.fill('input[name="schoolName"]', 'Flag High');
    await page.fill('input[name="location"]', 'Local');
    await page.fill('input[name="gradeLevel"]', '10');
    await page.getByRole('button', { name: /Join the waitlist/i }).click();
    await expect(page.getByRole('status')).toContainText(/on the list/i);
  });
});
