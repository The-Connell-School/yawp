import { expect, type Page } from '@playwright/test';

/** After enrollment, USO often shows a confirmation screen before `/app`. */
export async function completeUnifiedSignonToApp(
  page: Page,
  timeoutMs = 60_000
) {
  const isApp = (url: URL) =>
    url.pathname === '/app' || url.pathname.startsWith('/app/');
  if (isApp(new URL(page.url()))) return;

  const goToClass = page.getByRole('button', {
    name: 'Go to my class',
    exact: true,
  });
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (isApp(new URL(page.url()))) return;
    if (await goToClass.isVisible()) {
      await goToClass.click();
      await page.waitForURL(isApp, {
        timeout: Math.max(250, deadline - Date.now()),
      });
      return;
    }
    await page.waitForTimeout(100);
  }

  if (!isApp(new URL(page.url()))) {
    throw new Error(
      `Expected /app within ${timeoutMs}ms; still at ${page.url()}`
    );
  }
}

/** Two-step unified sign-on at `/auth/login` (identifier, then password). */
export async function submitUnifiedLogin(
  page: Page,
  identifier: string,
  password: string
) {
  const idField = page.getByLabel('Email or class code', { exact: true });
  await idField.fill(identifier);
  await expect(idField).toHaveValue(identifier);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const passwordField = page.getByLabel('Password', { exact: true });
  await expect(passwordField).toBeVisible({ timeout: 30_000 });
  await passwordField.fill(password);
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
}
