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
const qaClassTitle =
  process.env.QA_CLASS_TITLE || 'English 10 - Period 3';
const qaClassId = process.env.QA_CLASS_ID;

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

async function openQaClass(page: Page) {
  if (qaClassId) {
    await page.goto(`${baseUrl}/app/my-classes/${qaClassId}`);
    await page.waitForLoadState('networkidle');
    return;
  }
  await page.goto(`${baseUrl}/app/my-classes`);
  const classLink = page
    .locator('a[href*="/app/my-classes/"]')
    .filter({ hasText: qaClassTitle });
  if (await classLink.count()) {
    await classLink.first().click({ timeout: 60_000 });
  } else {
    await page.locator('a[href*="/app/my-classes/"]').first().click({
      timeout: 60_000,
    });
  }
  await page.waitForLoadState('networkidle');
}

async function openDocumentsTab(page: Page) {
  await openQaClass(page);
  const documentsTab = page.getByRole('tab', { name: /Documents/i });
  await documentsTab.click({ timeout: 60_000 });
  await page.waitForLoadState('networkidle');
}

/** Teacher class documents rows navigate straight to the submission when one exists. */
async function openSubmissionViaDocumentTitle(page: Page, documentTitle: string) {
  await openDocumentsTab(page);
  const row = page.getByRole('row').filter({ hasText: documentTitle }).first();
  await row.click({ timeout: 60_000 });
  await page.waitForURL(/\/app\/submissions\//, { timeout: 60_000 });
  await page.waitForLoadState('networkidle');
}

async function openAssignmentFromClassTab(page: Page, assignmentTitle: string) {
  await openQaClass(page);
  const assignmentsTab = page.getByRole('tab', { name: /Assignments/i });
  await assignmentsTab.click({ timeout: 60_000 });
  const row = page.getByRole('row').filter({ hasText: assignmentTitle }).first();
  await row.click({ timeout: 60_000 });
  await page.waitForURL(/\/app\/assignments\//, { timeout: 60_000 });
  await page.waitForLoadState('networkidle');
}

async function openPinnedLegacyEdit(page: Page) {
  await openAssignmentFromClassTab(page, 'DP QA Pinned Legacy (Preview)');
  await page.getByRole('button', { name: /^Edit/i }).click({ timeout: 60_000 });
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 60_000 });
  await dialog.getByRole('button', { name: 'Change', exact: true }).click();
  await dialog.locator('#assignment-create-point-value').waitFor({
    timeout: 60_000,
  });
  const pointValueInput = dialog.locator('#assignment-create-point-value');
  await pointValueInput.scrollIntoViewIfNeeded();
  await dialog
    .getByText(/Graded out of\s+30 points/i)
    .first()
    .waitFor({ timeout: 60_000 });
}

async function openSwapPersistenceSpecG(page: Page) {
  await openDocumentsTab(page);
  await page.getByText('DP QA Swap Persistence (Preview)', { exact: false }).first().waitFor({
    timeout: 60_000,
  });
  await page.getByText('DP QA swap persistence doc', { exact: false }).first().waitFor({
    timeout: 60_000,
  });
  await page.getByText(/10\s*\/\s*12/).first().waitFor({ timeout: 60_000 });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
context.setDefaultNavigationTimeout(120_000);
context.setDefaultTimeout(90_000);
const page = await context.newPage();

try {
  await passAccessGate(page);
  await devLogin(page, adminEmail);
  await page.goto(
    `${baseUrl}/app/admin/assignment-types/${dailyPagesTypeId}`
  );
  const rubricLibrarySelect = page.getByTestId('rubric-library-select');
  await rubricLibrarySelect.scrollIntoViewIfNeeded();
  await rubricLibrarySelect.waitFor({ state: 'visible', timeout: 60_000 });
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

  await openSubmissionViaDocumentTitle(page, 'DP QA class starter submission');
  const engagementTrigger = page.getByRole('button', {
    name: /^Engagement with Prompt/,
  });
  await engagementTrigger.waitFor({ timeout: 60_000 });
  await engagementTrigger.click();
  await page
    .getByTestId('grading-rubric-score-engagement_with_prompt')
    .waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(300);
  await shot(page, 'd-class-starter-grading');

  await openSubmissionViaDocumentTitle(page, 'DP QA teacher notes submission');
  await page
    .getByRole('region', { name: 'Teacher Context' })
    .waitFor({ timeout: 60_000 });
  await shot(page, 'e-teacher-notes');

  await openPinnedLegacyEdit(page);
  await shot(page, 'f-pinned-legacy-tiers');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await openSwapPersistenceSpecG(page);
  await shot(page, 'g-spec-g-persistence');

  console.log(JSON.stringify({ status: 'ok', outputDir, baseUrl }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
