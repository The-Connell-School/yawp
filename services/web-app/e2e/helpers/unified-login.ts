import type { Page } from '@playwright/test';

/** Two-step unified sign-on at `/auth/login` (identifier, then password). */
export async function submitUnifiedLogin(
  page: Page,
  identifier: string,
  password: string
) {
  await page.getByLabel('Email or class code', { exact: true }).fill(identifier);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
}
