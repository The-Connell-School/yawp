import { expect, test } from '../test-setup';

const BRAND_PRIMARY = '14.8837 58.9041% 57.0588%';
const HIGH_CONTRAST_PRIMARY = '14.8837 58.9041% 40%';

async function primaryToken(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--primary')
      .trim()
  );
}

test('high contrast is off by default and can be enabled from user settings', async ({
  page,
  signIn,
  e2eContext,
}) => {
  await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
  await page.goto('/app');
  await expect(page.getByTestId('app._index')).toBeVisible();

  await expect(page.locator('html')).not.toHaveAttribute(
    'data-contrast',
    'high'
  );
  await expect.poll(() => primaryToken(page)).toBe(BRAND_PRIMARY);

  await page.getByRole('button', { name: /settings/i }).click();
  await page.getByRole('button', { name: /user settings/i }).click();

  const highContrastSwitch = page.getByRole('switch', {
    name: /high contrast/i,
  });
  await expect(highContrastSwitch).toHaveAttribute('aria-checked', 'false');

  await highContrastSwitch.click();
  await expect(highContrastSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect.poll(() => primaryToken(page)).toBe(HIGH_CONTRAST_PRIMARY);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect.poll(() => primaryToken(page)).toBe(HIGH_CONTRAST_PRIMARY);
});
