import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
// Public disposable fixture identifiers; exercise the UI as an operator would.
const qaEmail = (key: string) => `${key}@signon.preview.yawp.invalid`;
const QA_CODES = { full: 'QA-FULL-101', multiple: 'QA-MULTI-101' };
const LOCAL_DEV_PASSWORD = 'yawp-dev';
const before = process.env.SIGNON_FIXTURE_PHASE === 'before';
test.skip(
  process.env.SIGNON_PREVIEW_FIXTURE_TEST !== '1',
  'Disposable local fixture database only'
);
for (const width of [1280, 390])
  for (const state of [
    'activation',
    'membership',
    'expired',
    'full',
    'multiple-classes',
  ]) {
    test(`${before ? 'before' : 'after'} real fixture ${state} at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width,
        height: width === 1280 ? 1000 : 844,
      });
      await page.goto('/auth/login');
      await page.waitForFunction(() =>
        Boolean((window as any).__reactRouterDataRouter)
      );
      const identifier =
        state === 'activation'
          ? qaEmail('passwordless')
          : state === 'membership'
            ? qaEmail('multiple')
            : state === 'expired'
              ? qaEmail(
                  width === 390 ? 'expired-invite-mobile' : 'expired-invite'
                )
              : state === 'full'
                ? QA_CODES.full
                : QA_CODES.multiple;
      await page.getByLabel('Email, handle, or class code').fill(identifier);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      if (before) {
        if (['full', 'multiple-classes'].includes(state))
          await expect(
            page.getByRole('heading', { name: 'Enter your password' })
          ).toBeVisible();
        else
          await expect(
            page.getByRole('heading', { name: 'Welcome to Yawp!' })
          ).toBeVisible();
      } else if (state === 'activation')
        await expect(
          page.getByRole('heading', { name: 'Finish setting up your account' })
        ).toBeVisible();
      else if (state === 'membership') {
        await page
          .getByLabel('Password', { exact: true })
          .fill(LOCAL_DEV_PASSWORD);
        await page.getByRole('button', { name: 'Log In', exact: true }).click();
        await expect(
          page.getByRole('heading', { name: 'Where are you working today?' })
        ).toBeVisible();
      } else if (state === 'expired') {
        await page
          .getByRole('button', { name: 'Email me a code', exact: true })
          .click();
        await expect(
          page.getByRole('heading', { name: 'Check your email' })
        ).toBeVisible();
        const capture = process.env.SIGNON_MAIL_CAPTURE_DIR!;
        let code: string | undefined;
        for (const file of readdirSync(capture).sort(
          (a, b) =>
            statSync(path.join(capture, b)).mtimeMs -
            statSync(path.join(capture, a)).mtimeMs
        )) {
          const data = JSON.parse(
            readFileSync(path.join(capture, file), 'utf8')
          );
          if (data.email === identifier) {
            code = data.code;
            break;
          }
        }
        if (!code) throw new Error('Private code missing');
        await page.getByLabel('Code', { exact: true }).fill(code);
        await page.getByRole('button', { name: 'Verify', exact: true }).click();
        await expect(page.getByText(/invitation.*expired/i)).toBeVisible();
        // Only capture the final state; no code, session or credential is visible.
      } else if (state === 'full')
        await expect(page.getByText(/class is full/i)).toBeVisible();
      else
        await expect(
          page.getByText('Preview QA multiple-a', { exact: true })
        ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      const dir = path.join(
        process.env.SIGNON_EVIDENCE_DIR!,
        before ? 'before' : 'after'
      );
      mkdirSync(dir, { recursive: true });
      await page.screenshot({
        path: path.join(dir, `${state}-${width}-impl.png`),
        fullPage: true,
      });
    });
  }
