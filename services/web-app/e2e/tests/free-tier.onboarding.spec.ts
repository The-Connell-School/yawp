import { expect, test } from '@playwright/test';

test.describe('Free tier public flow', () => {
  test('waitlist page loads', async ({ page }) => {
    await page.goto('/free');
    await expect(page.getByRole('heading', { name: /Try YAWP/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Join the waitlist/i })).toBeVisible();
  });

  test('admin approve page rejects missing token', async ({ page }) => {
    await page.goto('/free/admin/approve');
    await expect(page.getByText(/not valid|expired/i)).toBeVisible();
  });
});
