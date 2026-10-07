/**
 * Headless preview QA for Free Tier A. Requires preview deploy with
 * seed-preview-free-classroom fixture and the Free classroom access seat code.
 *
 *   PREVIEW_URL=https://pr-414.preview.yawp.school \
 *   PREVIEW_ACCESS_CODE=<free-classroom-seat-code> \
 *   node scripts/preview-qa-free-classroom.mjs
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const PREVIEW_FREE_CLASSROOM_TEACHER_EMAIL = 'dev.teacher.free@yawp.local';
const PREVIEW_FREE_CLASSROOM_STUDENT_EMAIL = 'dev.student.free@yawp.local';
const OUT_DIR =
  process.env.QA_SCREENSHOT_DIR ??
  '/workspace/qa/cursor-free-tier-a-provisioning-quotas-f277-screens';

const base = (process.env.PREVIEW_URL ?? '').replace(/\/$/, '');
const code = process.env.PREVIEW_ACCESS_CODE?.trim();
if (!base || !code) {
  console.error('Set PREVIEW_URL and PREVIEW_ACCESS_CODE');
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

async function shot(name) {
  const path = `${OUT_DIR}/${name}`;
  await page.screenshot({ path, fullPage: true });
  console.log('screenshot', path);
  return path;
}

async function devLogin(email) {
  await page.request.post(`${base}/auth/dev-login`, {
    form: { email },
  });
}

await page.goto(`${base}/?code=${encodeURIComponent(code)}`, {
  waitUntil: 'networkidle',
  timeout: 120_000,
});

await devLogin(PREVIEW_FREE_CLASSROOM_TEACHER_EMAIL);
await page.goto(`${base}/app`, { waitUntil: 'networkidle', timeout: 120_000 });
await shot('05-free-classroom-dashboard.png');

const newAssignment = page
  .getByRole('button', { name: /new assignment/i })
  .or(page.getByRole('button', { name: /create assignment/i }));
await newAssignment.first().click();
await page.waitForTimeout(1000);
await shot('06-free-classroom-quota-picker.png');

const quotaVisible = await page
  .getByText(/of 12 Class Starters left/i)
  .isVisible()
  .catch(() => false);
console.log('quota_counter_visible', quotaVisible);

const typeSelect = page.getByRole('combobox').first();
if (await typeSelect.count()) {
  await typeSelect.click();
  await page.waitForTimeout(500);
  await shot('07-free-classroom-type-options.png');
}

await page.keyboard.press('Escape');
await page.getByLabel(/title/i).fill('Quota preview final starter');
await page.getByLabel(/prompt/i).fill('One more class starter for QA.');
const classCheckbox = page.getByRole('checkbox').first();
if (await classCheckbox.count()) {
  await classCheckbox.check();
}
const submit = page.getByRole('button', { name: /create|save/i }).last();
if (await submit.isEnabled()) {
  await submit.click();
  await page.waitForTimeout(2000);
}
await newAssignment.first().click();
await page.waitForTimeout(1000);
await shot('08-free-classroom-exhausted-picker.png');

await page.goto(`${base}/app/my-classes`, {
  waitUntil: 'networkidle',
  timeout: 120_000,
});
const addClass = page.getByRole('button', { name: /add class|new class|create class/i });
if (await addClass.count()) {
  await addClass.first().click();
  await page.waitForTimeout(800);
}
await shot('09-free-classroom-one-class-limit.png');

await devLogin(PREVIEW_FREE_CLASSROOM_STUDENT_EMAIL);
await page.goto(`${base}/app`, { waitUntil: 'networkidle', timeout: 120_000 });
await shot('10-free-classroom-student-home.png');

await browser.close();
console.log('preview_qa_complete');
