import { expect, test } from '@playwright/test';

test.describe('Public landing page', () => {
  test('shows the AP1030 item number in the public footers', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(
      page.getByLabel('Site item number').getByText('[Item #: AP1030]')
    ).toBeVisible();

    await page.goto('/info');
    await page.locator('.yawp-footer').scrollIntoViewIfNeeded();
    await expect(
      page.getByLabel('Site item number').getByText('[Item #: AP1030]')
    ).toBeVisible();
  });
});
