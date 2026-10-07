import { expect, test } from '@playwright/test';

test.describe('Free tier public flow', () => {
  test('waitlist page loads', async ({ page }) => {
    await page.goto('/free');
    await expect(page.getByRole('heading', { name: /Try YAWP/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Join the waitlist/i })).toBeVisible();
  });

  test('waitlist form submits', async ({ page }) => {
    await page.goto('/free');
    await page.fill('input[name="name"]', 'E2E Waitlist');
    await page.fill('input[name="email"]', `e2e-waitlist+${Date.now()}@yawp.local`);
    await page.fill('input[name="schoolName"]', 'E2E High');
    await page.fill('input[name="location"]', 'Local');
    await page.fill('input[name="gradeLevel"]', '10');
    await page.getByRole('button', { name: /Join the waitlist/i }).click();
    await expect(page.getByRole('status')).toContainText(/on the list/i);
  });

  test('admin approve page rejects missing token', async ({ page }) => {
    await page.goto('/free/admin/approve');
    await expect(page.getByText(/not valid|expired/i)).toBeVisible();
  });

  test('join page does not treat release token as acquisition token', async ({ page }) => {
    await page.goto('/free/join?t=not-a-real-signed-token');
    await expect(page.getByText(/This link is not valid/i)).toBeVisible();
    await expect(page.getByText(/no longer valid/i)).not.toBeVisible();
  });
});
