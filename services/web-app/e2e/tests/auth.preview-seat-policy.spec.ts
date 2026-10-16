import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const before = process.env.SIGNON_POLICY_PHASE === 'before';
const off = process.env.SIGNON_POLICY_PHASE?.startsWith('off');
const picker = process.env.SIGNON_POLICY_PHASE?.startsWith('picker-');
test.skip(
  process.env.SIGNON_PREVIEW_FIXTURE_TEST !== '1',
  'Lane disposable database only'
);
for (const width of [1280, 390]) {
  for (const account of off || picker
    ? ['legacy']
    : ['multiple', 'inactive', 'orphan']) {
    test(`${process.env.SIGNON_POLICY_PHASE} ${account} at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width,
        height: width === 1280 ? 1000 : 844,
      });
      await page.goto('/auth/preview-access');
      await page.waitForFunction(() =>
        Boolean((window as any).__reactRouterDataRouter)
      );
      await page
        .getByLabel('Access code', { exact: true })
        .fill('local-fixture-master-access');
      await page
        .getByRole('button', { name: 'Open preview', exact: true })
        .click();
      await expect(
        page.getByLabel('Organization', { exact: true })
      ).toBeVisible();
      if (picker) {
        // Capture only the verified operator picker, with no code input.
      } else if (before || off) {
        await page
          .getByLabel('Organization', { exact: true })
          .selectOption('preview-signon-qa-school');
        await page
          .getByRole('button', {
            name: 'Continue to organization',
            exact: true,
          })
          .click();
        await expect(page).not.toHaveURL(/preview-access/);
        await page.goto('/auth/login?redirectTo=/app/my-classes');
      } else {
        await page
          .getByLabel('Sign-on QA account', { exact: true })
          .selectOption(account);
        await page
          .getByRole('button', { name: 'Open sign-on QA', exact: true })
          .click();
        await expect(page).toHaveURL(/\/auth\/login/);
      }
      await page.waitForFunction(() =>
        Boolean((window as any).__reactRouterDataRouter)
      );
      if (picker) {
        await expect(
          page.getByRole('heading', { name: 'Choose an organization' })
        ).toBeVisible();
      } else if (!off) {
        await page
          .getByLabel('Email, handle, or class code')
          .fill(`${account}@signon.preview.yawp.invalid`);
        await page
          .getByRole('button', { name: 'Continue', exact: true })
          .click();
        await page.getByLabel('Password', { exact: true }).fill('yawp-dev');
        await page.getByRole('button', { name: 'Log In', exact: true }).click();
        if (before && account === 'multiple')
          await expect(page).toHaveURL(/\/app\/my-classes/);
        else if (before)
          await expect(
            page
              .getByRole('alert')
              .filter({ hasText: "That password isn't right" })
          ).toBeVisible();
        else if (account === 'multiple') {
          await expect(
            page.getByRole('heading', { name: 'Where are you working today?' })
          ).toBeVisible();
          await expect(
            page.getByText('Preview QA school', { exact: true })
          ).toBeVisible();
          await expect(
            page.getByText('Preview QA second', { exact: true })
          ).toBeVisible();
          await expect(
            page.getByText('Preview QA free', { exact: true })
          ).toHaveCount(0);
        } else
          await expect(
            page.getByRole('heading', { name: "Your account isn't active" })
          ).toBeVisible();
      } else {
        await expect(
          page.getByLabel('Password', { exact: true })
        ).toBeVisible();
        await expect(page.locator('[data-signon-screen="entry"]')).toHaveCount(
          0
        );
      }
      await page.evaluate(() => document.fonts.ready);
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      const dir = path.join(
        process.env.SIGNON_EVIDENCE_DIR!,
        process.env.SIGNON_POLICY_PHASE!
      );
      mkdirSync(dir, { recursive: true });
      await page.screenshot({
        path: path.join(dir, `${account}-${width}-impl.png`),
        fullPage: true,
        mask: before ? [page.locator('input[type="password"]')] : undefined,
      });
      if (!before && !off && account === 'multiple') {
        await page.getByRole('button', { name: /Preview QA second/ }).click();
        await expect(page).toHaveURL(/\/app/);
      }
      if (!before && !off && account === 'orphan') {
        await page
          .getByRole('button', { name: 'Enter a class code', exact: true })
          .click();
        await expect(
          page.getByLabel('Class code', { exact: true })
        ).toBeVisible();
      }
    });
  }
}
