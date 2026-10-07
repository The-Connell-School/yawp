/**
 * Captures the seven PR #412 QA screenshots against a running preview or local dev.
 */
import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const baseUrl =
  process.env.PREVIEW_BASE_URL?.replace(/\/$/, '') ||
  `http://localhost:${process.env.DEV_PORT || '5173'}`;
const accessCode = process.env.PREVIEW_ACCESS_CODE;
const outputDir =
  process.env.OUTPUT_DIR ||
  join(import.meta.dir, '../../../qa/dp-consolidation-screens');
const dailyPagesTypeId =
  process.env.DAILY_PAGES_TYPE_ID || 'cmlgtyo8j01em0qjs6knw7cni';
const teacherEmail =
  process.env.QA_TEACHER_EMAIL || 'dev.teacher@yawp.local';
const adminEmail = process.env.QA_ADMIN_EMAIL || 'dev.admin@yawp.local';
const password = process.env.QA_PASSWORD || 'yawp-dev';

mkdirSync(outputDir, { recursive: true });

async function passAccessGate(page: Page) {
  if (!accessCode) return;
  await page.goto(`${baseUrl}/?code=${encodeURIComponent(accessCode)}`);
  const codeField = page.getByLabel('Access code');
  if (await codeField.isVisible().catch(() => false)) {
    await codeField.fill(accessCode);
    await page.getByRole('button', { name: 'Open preview' }).click();
    await page.waitForLoadState('networkidle');
  }
}

async function devLogin(page: Page, email: string) {
  await passAccessGate(page);
  const loggedIn = await page.evaluate(async (loginEmail) => {
    const response = await fetch('/auth/dev-login', {
      method: 'POST',
      body: new URLSearchParams({ email: loginEmail, password: 'yawp-dev' }),
    });
    return response.ok;
  }, email);
  if (!loggedIn) {
    throw new Error(`Dev login failed for ${email}`);
  }
  await page.goto(`${baseUrl}/app/my-classes`);
  await page.waitForLoadState('networkidle');
}

async function shot(page: Page, name: string) {
  const path = join(outputDir, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log(`Wrote ${path}`);
}

async function openClassWorkspace(page: Page) {
  await page.goto(`${baseUrl}/app/my-classes`);
  await page.locator('a[href*="/app/my-classes/"]').first().click({
    timeout: 60_000,
  });
}

async function openSubmissionByTitle(page: Page, title: string) {
  await openClassWorkspace(page);
  const row = page.getByText(title, { exact: false }).first();
  await row.waitFor({ timeout: 60_000 });
  await row.click();
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  await passAccessGate(page);
  await devLogin(page, adminEmail);
  await page.goto(
    `${baseUrl}/app/admin/assignment-types/${dailyPagesTypeId}`
  );
  await page.getByText(/Library rubric|Grading assistant/i).first().waitFor({
    timeout: 60_000,
  });
  await shot(page, 'a-admin-rubric-picker');

  await devLogin(page, teacherEmail);
  await page.goto(`${baseUrl}/app/assignment-types/${dailyPagesTypeId}`);
  await page
    .getByRole('heading', { name: 'About Daily Pages' })
    .waitFor({ timeout: 60_000 });
  await page
    .getByRole('button', { name: 'What a Daily Pages entry is' })
    .click();
  await page
    .getByText(/Graded on engagement in four tiers/i)
    .waitFor({ timeout: 60_000 });
  await page.getByRole('button', { name: 'How it is graded' }).click();
  await shot(page, 'b-daily-pages-about');

  await page.getByRole('button', { name: /^New/ }).click();
  await page.getByRole('menuitem', { name: 'Assignment' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Point value').fill('12');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByText(/Graded out of 12 points in bands/i).waitFor();
  await shot(page, 'c-create-12pt');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await openSubmissionByTitle(page, 'DP QA class starter submission');
  await page
    .getByTestId('grading-rubric-score-engagement_with_prompt')
    .waitFor({ timeout: 60_000 });
  await shot(page, 'd-class-starter-grading');

  await openSubmissionByTitle(page, 'DP QA teacher notes submission');
  await page
    .getByRole('region', { name: 'Teacher Context' })
    .waitFor({ timeout: 60_000 });
  await shot(page, 'e-teacher-notes');

  await openClassWorkspace(page);
  await page.getByText('DP QA Pinned Legacy (Preview)').first().click({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: /Edit assignment/i }).click({
    timeout: 30_000,
  });
  await page.getByRole('dialog').waitFor();
  await shot(page, 'f-pinned-legacy-tiers');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await openClassWorkspace(page);
  await page.getByText('DP QA Swap Persistence (Preview)').waitFor({
    timeout: 60_000,
  });
  await page.getByText('10/12').waitFor();
  await shot(page, 'g-spec-g-persistence');

  console.log(JSON.stringify({ status: 'ok', outputDir, baseUrl }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
