import type { Page } from '@playwright/test';

/** Fills public /free waitlist fields for legacy text inputs and v2 grade select. */
export async function fillFreeTierWaitlistField(
  page: Page,
  name: string,
  value: string
) {
  if (name === 'gradeLevel') {
    const select = page.locator('select[name="gradeLevel"]');
    if (await select.count()) {
      await select.selectOption(value);
      return;
    }
  }
  await page.locator(`input[name="${name}"]`).fill(value);
}

export async function fillFreeTierWaitlistForm(
  page: Page,
  fields: Record<string, string>
) {
  for (const [field, value] of Object.entries(fields)) {
    await fillFreeTierWaitlistField(page, field, value);
  }
}
