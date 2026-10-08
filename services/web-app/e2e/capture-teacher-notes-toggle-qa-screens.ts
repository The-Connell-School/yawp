/**
 * Headless Playwright captures for PR #415 teacher-notes toggle QA.
 *
 * Usage (set secrets via env; never commit preview access codes):
 *   PREVIEW_URL='https://…' PREVIEW_CODE='…' \
 *   PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_PASSWORD='…' \
 *   bun run e2e/capture-teacher-notes-toggle-qa-screens.ts
 */
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PREVIEW_TEACHER_NOTES_QA_NOTE,
  PREVIEW_TEACHER_NOTES_QA_STUDENT_EMAIL,
  PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL,
} from '../../../packages/prisma/scripts/local-dev/preview-teacher-notes-qa';

const STAFF_GRADING_EMAIL = 'dev.teacher@yawp.local';

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
  if (ok) return;

  const password =
    email === PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL
      ? process.env.PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_PASSWORD?.trim()
      : undefined;
  if (password && password.length >= 16) {
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((url) => url.pathname.startsWith('/app'), {
      timeout: 60_000,
    });
    return;
  }

  throw new Error(`Dev login failed for ${email}`);
}

async function openDailyPagesAssignmentType(page: import('@playwright/test').Page) {
  await page.goto(`${origin}/app/admin/assignments`);
  await page.getByText('Daily Pages', { exact: true }).click();
  await page.waitForURL(/\/app\/admin\/assignment-types\/[^/]+$/);
  const toggle = page.getByTestId('rubric-teacher-notes-toggle');
  await toggle.waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('text=Notes to the teacher').scrollIntoViewIfNeeded();
  return toggle;
}

async function setToggle(
  page: import('@playwright/test').Page,
  toggle: import('@playwright/test').Locator,
  checked: boolean
) {
  const isChecked = await toggle.isChecked();
  if (isChecked !== checked) {
    await toggle.click();
    await expect
      .poll(async () => toggle.isChecked(), { timeout: 30_000 })
      .toBe(checked);
    await page.waitForTimeout(400);
  }
}

async function resolveQaSubmissionHref(page: import('@playwright/test').Page) {
  const fromEnv = process.env.PREVIEW_QA_SUBMISSION_ID?.trim();
  if (fromEnv) return `/app/submissions/${fromEnv}`;

  await devLogin(page, 'dev.teacher@yawp.local');
  await page.goto(`${origin}/app/my-classes`);
  await page.locator('a[href^="/app/my-classes/"]').first().click({ timeout: 60_000 });
  await page.getByRole('tab', { name: /Documents/i }).click();
  const qaRow = page.getByText('QA #415 Daily Pages', { exact: false });
  const href = await qaRow
    .locator('xpath=ancestor::tr//a[contains(@href,"/app/submissions/")]')
    .first()
    .getAttribute('href', { timeout: 30_000 })
    .catch(async () =>
      page
        .locator('a[href*="/app/submissions/"]')
        .first()
        .getAttribute('href', { timeout: 15_000 })
    );
  if (!href) {
    throw new Error('Could not find a class submission link for QA capture');
  }
  return href;
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(gateUrl, { timeout: 60_000 });

  await devLogin(page, PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL);
  let toggle = await openDailyPagesAssignmentType(page);
  await setToggle(page, toggle, false);
  await page.screenshot({
    path: join(outDir, 'toggle-off-superadmin.png'),
    fullPage: true,
  });

  await setToggle(page, toggle, true);
  await page.screenshot({
    path: join(outDir, 'toggle-on-superadmin.png'),
    fullPage: true,
  });

  await devLogin(page, 'dev.admin@yawp.local');
  toggle = await openDailyPagesAssignmentType(page);
  await expect(toggle).toBeDisabled();
  await page.screenshot({
    path: join(outDir, 'toggle-disabled-plain-admin.png'),
    fullPage: true,
  });

  await devLogin(page, PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL);
  toggle = await openDailyPagesAssignmentType(page);
  await setToggle(page, toggle, true);

  const submissionHref = await resolveQaSubmissionHref(page);

  await devLogin(page, STAFF_GRADING_EMAIL);
  await page.goto(`${origin}${submissionHref}`);
  await page.waitForLoadState('networkidle');
  const notesOn = page.getByTestId('teacher-private-notes');
  await expect(notesOn).toContainText(PREVIEW_TEACHER_NOTES_QA_NOTE, {
    timeout: 30_000,
  });
  await page.screenshot({
    path: join(outDir, 'teacher-view-with-note.png'),
    fullPage: true,
  });

  await devLogin(page, PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL);
  toggle = await openDailyPagesAssignmentType(page);
  await setToggle(page, toggle, false);

  await devLogin(page, STAFF_GRADING_EMAIL);
  await page.goto(`${origin}${submissionHref}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('teacher-private-notes')).toHaveCount(0);
  await page.screenshot({
    path: join(outDir, 'teacher-view-no-note.png'),
    fullPage: true,
  });

  await devLogin(page, PREVIEW_TEACHER_NOTES_QA_STUDENT_EMAIL);
  await page.goto(`${origin}${submissionHref}`);
  await page.waitForLoadState('networkidle');
  if (await page.getByRole('heading', { name: /Something didn't work/i }).count()) {
    await page.goto(`${origin}/app`);
    await page.waitForLoadState('networkidle');
  }
  await expect(page.getByTestId('teacher-private-notes')).toHaveCount(0);
  expect(await page.content()).not.toContain(PREVIEW_TEACHER_NOTES_QA_NOTE);
  await page.screenshot({
    path: join(outDir, 'student-view-no-note.png'),
    fullPage: true,
  });

  writeFileSync(
    join(outDir, 'README.txt'),
    [
      'PR #415 teacher-notes toggle QA captures (preview seed-mode only).',
      `Superadmin: ${PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL}`,
      `Note marker: ${PREVIEW_TEACHER_NOTES_QA_NOTE}`,
      '',
    ].join('\n')
  );

  console.log(JSON.stringify({ status: 'ok', outDir, submissionHref }));
} finally {
  await browser.close();
}
