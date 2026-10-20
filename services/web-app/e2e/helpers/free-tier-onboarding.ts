import type { Page } from '@playwright/test';

/** Completes the v2 class-preparation step when it is the current onboarding screen. */
export async function completeClassPreparationStepIfShown(
  page: Page,
  {
    className = 'English 10',
    grade = '10',
  }: { className?: string; grade?: string } = {}
) {
  const classNameInput = page.locator('input[name="className"]');
  if ((await classNameInput.count()) === 0) return;
  await classNameInput.fill(className);
  const gradeSelect = page.locator('select[name="grade"]');
  if (await gradeSelect.count()) await gradeSelect.selectOption(grade);
  else await page.locator('input[name="grade"]').fill(grade);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}
