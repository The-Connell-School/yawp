/**
 * Headless Playwright captures for PR #415 teacher-notes toggle QA.
 *
 * Usage:
 *   PREVIEW_URL='https://pr-415.preview.yawp.school' \
 *   PREVIEW_CODE='wise-finch-2723' \
 *   bun run e2e/capture-teacher-notes-toggle-qa-screens.ts
 */
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PREVIEW_TEACHER_NOTES_QA_NOTE,
  PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL,
} from '../../../packages/prisma/scripts/local-dev/preview-teacher-notes-qa';

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

async function openDailyPagesAssignmentType(page: import('@playwright/test').Page) {
  await page.goto(`${origin}/app/admin/assignment-types`);
  await page.getByRole('heading', { name: 'Daily Pages', level: 3 }).click();
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
  }
}

async function resolveQaSubmissionHref(page: import('@playwright/test').Page) {
  const fromEnv = process.env.PREVIEW_QA_SUBMISSION_ID?.trim();
  if (fromEnv) return `/app/submissions/${fromEnv}`;

  await devLogin(page, 'dev.teacher@yawp.local');
  await page.goto(`${origin}/app/classes`);
  const links = page.locator('a[href*="/app/submissions/"]');
  const count = await links.count();
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute('href');
    if (!href) continue;
    await page.goto(`${origin}${href}`);
    const notes = page.getByTestId('teacher-private-notes');
    if (await notes.count()) {
      const text = await notes.textContent();
      if (text?.includes('QA #415')) return href;
    }
  }
  throw new Error('Could not find Daily Pages submission with QA #415 teacher note');
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

  const submissionHref = await resolveQaSubmissionHref(page);

  await devLogin(page, 'dev.teacher@yawp.local');
  await devLogin(page, PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL);
  toggle = await openDailyPagesAssignmentType(page);
  await setToggle(page, toggle, true);

  await devLogin(page, 'dev.teacher@yawp.local');
  await page.goto(`${origin}${submissionHref}`);
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

  await devLogin(page, 'dev.teacher@yawp.local');
  await page.goto(`${origin}${submissionHref}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('teacher-private-notes')).toHaveCount(0);
  await page.screenshot({
    path: join(outDir, 'teacher-view-no-note.png'),
    fullPage: true,
  });

  await devLogin(page, 'dev.student.graded@yawp.local');
  await page.goto(`${origin}${submissionHref}`);
  await page.waitForLoadState('networkidle');
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
