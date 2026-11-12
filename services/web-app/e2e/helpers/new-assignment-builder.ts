import { expect, type Page } from '@playwright/test';

/** Waits for the full-page assignment builder introduced in #941. */
export async function expectNewAssignmentBuilderPage(page: Page) {
  await expect(page).toHaveURL(/\/app\/assignments\/new/);
  await expect(page.getByTestId('assignment-builder-v3')).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole('heading', { name: /new assignment/i })
  ).toBeVisible();
  await expect(page.locator('#abv3-title')).toBeVisible();
  await expect(page.locator('#abv3-prompt')).toBeVisible();
}

export async function openNewAssignmentFromButton(
  page: Page,
  buttonName: string | RegExp = /New Assignment/i
) {
  await page
    .getByRole('button', { name: buttonName, exact: typeof buttonName === 'string' })
    .first()
    .click();
  await expectNewAssignmentBuilderPage(page);
}

export async function openAssignmentTypePicker(page: Page) {
  await page.getByRole('button', { name: 'Change' }).click();
  const picker = page.getByRole('dialog', { name: 'Assignment type' });
  await expect(picker).toBeVisible();
  return picker;
}

export async function fillAndSubmitNewAssignmentBuilder(
  page: Page,
  input: { title: string; prompt: string }
) {
  await page.locator('#abv3-title').fill(input.title);
  await page.locator('#abv3-prompt').fill(input.prompt);
  await page.getByRole('button', { name: 'Create assignment' }).click();
}

export async function expectEditAssignmentBuilderPage(page: Page) {
  await expect(page).toHaveURL(/\/app\/assignments\/[^/]+\/edit/);
  await expect(page.getByTestId('assignment-builder-v3')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /edit assignment/i })
  ).toBeVisible();
}
