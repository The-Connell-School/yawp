import { expect, type Page } from '@playwright/test';

export async function clickClassNewAssignment(page: Page) {
  await page
    .getByRole('button', { name: /New Assignment/ })
    .first()
    .click();
  await expectNewAssignmentBuilderPage(page);
}

export async function expectNewAssignmentBuilderPage(page: Page) {
  await expect(page).toHaveURL(/\/app\/assignments\/new/);
  await expect(page.getByTestId('assignment-builder-v3')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /^New assignment$/i })
  ).toBeVisible();
  await expect(page.locator('#abv3-title')).toBeVisible();
  await expect(page.locator('#abv3-prompt')).toBeVisible();
}

export async function fillAndCreateOnAssignmentBuilderV3(
  page: Page,
  input: { title: string; prompt: string }
) {
  await page.locator('#abv3-title').fill(input.title);
  await page.locator('#abv3-prompt').fill(input.prompt);
  await page.getByRole('button', { name: 'Create assignment' }).click();
}

export async function finishAssignmentCreatedView(page: Page) {
  await expect(page.getByTestId('assignment-builder-v3-created')).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/app\/assignments\/.+/);
}

export async function openAssignmentTypePicker(page: Page) {
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Assignment type' })
  ).toBeVisible();
}

export async function expectTypeAbsentInPicker(page: Page, title: string) {
  await openAssignmentTypePicker(page);
  await expect(
    page.getByRole('dialog', { name: 'Assignment type' }).getByRole('button', {
      name: title,
    })
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
}

export async function expectTypePresentInPicker(page: Page, title: string) {
  await openAssignmentTypePicker(page);
  await expect(
    page.getByRole('dialog', { name: 'Assignment type' }).getByRole('button', {
      name: title,
    })
  ).toBeVisible();
  await page.keyboard.press('Escape');
}
