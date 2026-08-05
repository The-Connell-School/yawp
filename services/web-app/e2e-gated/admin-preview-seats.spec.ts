import { expect, test } from '@playwright/test';

const MASTER_CODE = 'brave-otter-4193';

test('admin creates a persistent seeded preview seat and retrieves its code', async ({
  page,
}) => {
  await page.goto('/accessibility');
  await page.getByLabel('Access code').fill(MASTER_CODE);
  await page.getByRole('button', { name: 'Open preview' }).click();

  await page
    .getByRole('button', {
      name: 'Local development environment. Open dev login menu.',
    })
    .click();
  await page.getByRole('button', { name: /^Dev Admin\b/ }).click();
  await expect(page).toHaveURL(/\/app(\/|$)/);
  await page.goto('/app/admin/organizations');
  await expect(page).toHaveURL('/app/admin/organizations');

  await page.getByRole('button', { name: 'Create Preview Seat' }).click();
  await page.getByRole('button', { name: 'Create and Seed Seat' }).click();
  const generatedCode = page.locator('[data-preview-seat-code]');
  await expect(generatedCode).toHaveText(/^[a-z]+-[a-z]+-[1-9][0-9]{3}$/, {
    timeout: 120_000,
  });
  const accessCode = (await generatedCode.textContent())?.trim();
  expect(accessCode).toBeTruthy();

  await page.reload();
  await expect(
    page.getByRole('columnheader', { name: 'Access Code' })
  ).toBeVisible();
  await expect(page.getByText(accessCode!, { exact: true })).toBeVisible();

  await page
    .getByRole('button', {
      name: 'Local development environment. Open dev login menu.',
    })
    .click();
  await page.getByRole('button', { name: 'Re-enter access code' }).click();
  await page.getByLabel('Access code').fill(accessCode!);
  await page.getByRole('button', { name: 'Open preview' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('[data-preview-access-screen]')).toHaveCount(0);
  // Entering a code with no returnTo lands on `/`, which takes the root loader's public
  // fast path and renders no dev bar. Go somewhere the bar exists before opening it.
  await page.goto('/accessibility');
  await page
    .getByRole('button', {
      name: 'Local development environment. Open dev login menu.',
    })
    .click();
  await expect(
    page.getByText(/Current seat: Yawp Preview - Seat \d+/)
  ).toBeVisible();
  await expect(page.getByText('Alex Teacher')).toBeVisible();
});
