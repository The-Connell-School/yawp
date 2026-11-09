import { expect, type Page } from '@playwright/test';

/** After enrollment, USO often shows a confirmation screen before `/app`. */
export type CompleteUnifiedSignonOptions = {
  /** When USO shows the membership picker, choose this organization name. */
  membershipOrganization?: string;
};

export async function completeUnifiedSignonToApp(
  page: Page,
  timeoutMs = 60_000,
  options?: CompleteUnifiedSignonOptions
) {
  const isApp = (url: URL) =>
    url.pathname === '/app' || url.pathname.startsWith('/app/');
  if (isApp(new URL(page.url()))) return;

  const goToClass = page.getByRole('button', {
    name: 'Go to my class',
    exact: true,
  });
  const membershipPicker = page.getByRole('heading', {
    name: 'Where are you working today?',
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
    if (await membershipPicker.isVisible()) {
      const memberships = page
        .getByRole('group', { name: 'Choose organization and role' })
        .getByRole('button');
      const pick =
        options?.membershipOrganization &&
        (await page
          .getByRole('button', { name: new RegExp(options.membershipOrganization) })
          .count())
          ? page.getByRole('button', {
              name: new RegExp(options.membershipOrganization),
            })
          : memberships.last();
      await pick.first().click();
      await page.waitForTimeout(200);
      continue;
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
  await page.waitForLoadState('domcontentloaded');
  const idField = page.getByLabel('Email or class code', { exact: true });
  await expect(idField).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    await idField.click();
    await idField.fill(identifier);
    await expect(idField).toHaveValue(identifier);
  }).toPass({ timeout: 15_000 });
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  const passwordField = page.getByLabel('Password', { exact: true });
  await expect(passwordField).toBeVisible({ timeout: 30_000 });
  await passwordField.fill(password);
  const logIn = page.getByRole('button', { name: 'Log In', exact: true });
  await expect(logIn).toBeEnabled();
  await logIn.click();
}
