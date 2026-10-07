/**
 * Headless Playwright captures for PR #415 teacher-notes toggle QA.
 * Usage: PREVIEW_URL='https://pr-415.preview.yawp.school' PREVIEW_CODE='wise-finch-2723' bun run e2e/capture-teacher-notes-toggle-qa-screens.ts
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const previewUrl = process.env.PREVIEW_URL?.replace(/\/$/, '');
const previewCode = process.env.PREVIEW_CODE;
const outDir =
  process.env.QA_SCREEN_DIR ??
  join(process.cwd(), 'qa-screens', 'pr-415-teacher-notes-toggle');

if (!previewUrl || !previewCode) {
  console.error('Set PREVIEW_URL and PREVIEW_CODE');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const origin = previewUrl;
const gateUrl = `${origin}/?code=${encodeURIComponent(previewCode)}`;

async function devLogin(page: import('@playwright/test').Page, email: string) {
  await page.goto(`${origin}/auth/login`);
  const ok = await page.evaluate(async (loginEmail) => {
    const response = await fetch('/auth/dev-login', {
      method: 'POST',
      body: new URLSearchParams({ email: loginEmail }),
    });
    return response.ok;
  }, email);
  if (!ok) throw new Error(`Dev login failed for ${email}`);
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(gateUrl);
  await devLogin(page, 'dev.admin@yawp.local');

  await page.goto(`${origin}/app/admin/assignments`);
  await page.getByRole('link', { name: /Class Starter/i }).first().click();
  await page.waitForURL(/\/app\/admin\/assignment-types\//);

  const toggle = page.getByTestId('rubric-teacher-notes-toggle');
  await toggle.waitFor({ state: 'visible', timeout: 60000 });

  if (await toggle.isEnabled()) {
    if (await toggle.isChecked()) {
      await toggle.click();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({
      path: join(outDir, 'toggle-off-superadmin.png'),
      fullPage: true,
    });
    await toggle.click();
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: join(outDir, 'toggle-on-superadmin.png'),
      fullPage: true,
    });
  } else {
    await page.screenshot({
      path: join(outDir, 'toggle-disabled-plain-admin.png'),
      fullPage: true,
    });
    writeFileSync(
      join(outDir, 'README.txt'),
      'dev.admin@yawp.local was not superadmin on preview; only disabled-admin screenshot captured.\n'
    );
  }

  await devLogin(page, 'dev.teacher@yawp.local');
  const submissionLink = page
    .locator('a[href*="/app/submissions/"]')
    .first();
  if (await submissionLink.count()) {
    await submissionLink.click();
    await page.waitForURL(/\/app\/submissions\//);
    const notes = page.getByTestId('teacher-private-notes');
    if (await notes.count()) {
      await page.screenshot({
        path: join(outDir, 'teacher-view-with-note.png'),
        fullPage: true,
      });
    }
    await devLogin(page, 'dev.student@yawp.local');
    await page.goto(page.url());
    await page.screenshot({
      path: join(outDir, 'student-view-no-note.png'),
      fullPage: true,
    });
  }

  console.log(JSON.stringify({ status: 'ok', outDir }));
} finally {
  await browser.close();
}
