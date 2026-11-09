import { expect, type Page } from '@playwright/test';

/** After enrollment, USO often shows a confirmation screen before `/app`. */
export async function completeUnifiedSignonToApp(
  page: Page,
  timeoutMs = 60_000
) {
  const isApp = (url: URL) =>
    url.pathname === '/app' || url.pathname.startsWith('/app/');
  const goToClass = page.getByRole('button', {
    name: 'Go to my class',
    exact: true,
  });

  await expect(async () => {
    if (isApp(new URL(page.url()))) return;
    if (await goToClass.isVisible()) await goToClass.click();
    expect(isApp(new URL(page.url()))).toBe(true);
  }).toPass({ timeout: timeoutMs });
}

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
