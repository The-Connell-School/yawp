import { expect, type Page } from '@playwright/test';

export async function clickClassNewAssignment(page: Page) {
  const dashboardCreate = page
    .getByTestId('teacher-assignments-grid')
    .getByRole('button', { name: /new assignment/i });
  if (await dashboardCreate.count()) {
    await dashboardCreate.first().click();
  } else {
    await page
      .getByRole('button', { name: /New Assignment|New assignment/i })
      .first()
      .click();
  }
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
  await expect(page).not.toHaveURL(/\/app\/assignments\/new(?:\?|$)/, {
    timeout: 20_000,
  });
  const onBuilder = await page.getByTestId('assignment-builder-v3').count();
  if (onBuilder === 0) {
    return;
  }
  const legacySuccess = page.getByTestId('assignment-builder-v3-created');
  const sheetSuccess = page.getByTestId('assignment-created-success');
  if (await legacySuccess.count()) {
    await expect(legacySuccess).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Done' }).click();
  } else if (await sheetSuccess.count()) {
    await expect(sheetSuccess).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('assignment-created-done').click();
  }
  await expect(page).toHaveURL(/\/app(\/|$)|\/app\/assignments\/.+/);
}

export async function openAssignmentTypePicker(page: Page) {
  const v3Trigger = page.locator('.abv3-type-select-trigger');
  if (await v3Trigger.count()) {
    await v3Trigger.click();
    await expect(
      page.getByPlaceholder('Search assignment types…')
    ).toBeVisible();
    return;
  }
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Assignment type' })
  ).toBeVisible();
}

async function closeAssignmentTypePicker(page: Page) {
  if (await page.getByPlaceholder('Search assignment types…').count()) {
    await page.keyboard.press('Escape');
    return;
  }
  await page.keyboard.press('Escape');
}

export async function expectTypeAbsentInPicker(page: Page, title: string) {
  await openAssignmentTypePicker(page);
  const v3List = page.getByRole('option', { name: new RegExp(title, 'i') });
  const legacyDialog = page.getByRole('dialog', { name: 'Assignment type' });
  if (await page.getByPlaceholder('Search assignment types…').count()) {
    await expect(v3List).toHaveCount(0);
  } else {
    await expect(
      legacyDialog.getByRole('button', { name: title })
    ).toHaveCount(0);
  }
  await closeAssignmentTypePicker(page);
}

export async function expectTypePresentInPicker(page: Page, title: string) {
  await openAssignmentTypePicker(page);
  if (await page.getByPlaceholder('Search assignment types…').count()) {
    await expect(
      page.getByRole('option', { name: new RegExp(title, 'i') })
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole('dialog', { name: 'Assignment type' }).getByRole('button', {
        name: title,
      })
    ).toBeVisible();
  }
  await closeAssignmentTypePicker(page);
}
