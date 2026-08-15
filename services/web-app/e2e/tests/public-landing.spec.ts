import { expect, test } from '@playwright/test';

test.describe('Public landing page', () => {
  test('shows footer details in the public footers', async ({ page }) => {
    await page.goto('/');

    const homeFooter = page.getByLabel('Site footer details');
    await expect(homeFooter.getByText('[Item #: AP1030]')).toBeVisible();
    await expect(
      homeFooter.getByRole('link', { name: 'Accessibility' })
    ).toHaveAttribute('href', '/accessibility');

    await page.goto('/info');
    await page.locator('.yawp-footer').scrollIntoViewIfNeeded();
    const infoFooter = page.getByLabel('Site footer details');
    await expect(infoFooter.getByText('[Item #: AP1030]')).toBeVisible();
    await expect(
      infoFooter.getByRole('link', { name: 'Accessibility' })
    ).toHaveAttribute('href', '/accessibility');
  });
});
