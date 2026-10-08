/**
 * Capture PR-preview QA screenshots for free-tier handle + password flows.
 * Requires env vars (never commit secrets):
 *   PREVIEW_BASE_URL=https://pr-413.preview.yawp.school
 *   PREVIEW_ACCESS_CODE=<from PR preview comment>
 *
 *   cd services/web-app && bun run ../qa/capture-handle-password-preview.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.PREVIEW_BASE_URL?.replace(/\/$/, '');
const ACCESS_CODE = process.env.PREVIEW_ACCESS_CODE?.trim();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'qa', 'handle-password-screens');

const TEACHER_EMAIL = 'preview.free-classroom@yawp.local';
const TEACHER_PASSWORD = 'yawp-dev';
const EMAIL_STUDENT = process.env.PREVIEW_EMAIL_STUDENT?.trim() || 'preview-student-0001@example.test';
const EMAIL_STUDENT_PASSWORD = process.env.PREVIEW_EMAIL_STUDENT_PASSWORD ?? 'yawp-dev';

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: true });
  console.log('saved', path);
}

async function passPreviewGate(page) {
  if (!ACCESS_CODE) throw new Error('PREVIEW_ACCESS_CODE is required');
  await page.goto(`${BASE}/auth/preview-access`, { waitUntil: 'domcontentloaded' });
  const codeInput = page.getByLabel(/access code/i);
  if (await codeInput.isVisible().catch(() => false)) {
    await codeInput.fill(ACCESS_CODE);
    await page.getByRole('button', { name: /continue|submit|enter/i }).click();
  } else {
    await page.goto(`${BASE}/?code=${ACCESS_CODE}`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(1500);
}

async function login(page, identifier, password) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
  await page.getByLabel(/email or handle/i).fill(identifier);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole('button', { name: /^log in$/i }).click();
  await page.waitForURL(/\/app/, { timeout: 90_000 });
}

async function joinStudent(page, joinUrl, { name, handle, password }) {
  await page.goto(joinUrl, { waitUntil: 'networkidle' });
  await page.getByLabel('Display name').fill(name);
  await page.getByLabel('Handle').fill(handle);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Join class' }).click();
}

async function main() {
  if (!BASE) throw new Error('PREVIEW_BASE_URL is required');
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);

  const run = Date.now().toString(36);
  const studentHandle = `prev${run}`.slice(0, 20);
  const studentPassword = 'preview-pass-12';
  const dupHandle = studentHandle;

  try {
    await passPreviewGate(page);
    await shot(page, '00-preview-gate-passed.png');

    await login(page, TEACHER_EMAIL, TEACHER_PASSWORD);
    await shot(page, '01-teacher-logged-in.png');

    await page.goto(`${BASE}/app/my-classes`, { waitUntil: 'networkidle' });
    await shot(page, '02-teacher-my-classes.png');

    const createBtn = page.getByRole('button', { name: /create class|new class/i }).first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.getByLabel(/class code|code/i).first().fill(`P${run}`.slice(0, 8).toUpperCase());
      const save = page.getByRole('button', { name: /create|save/i }).first();
      await save.click();
      await page.waitForTimeout(2000);
    }
    await shot(page, '03-teacher-class-created.png');

    await page.goto(`${BASE}/app/my-classes`, { waitUntil: 'networkidle' });
    const classLink = page.getByRole('link', { name: /FREEPRV|P\d/i }).first();
    await classLink.click();
    await page.waitForURL(/\/app\/my-classes\//);
    await page.getByRole('tab', { name: /students/i }).click().catch(() => {});
    await shot(page, '04-teacher-student-join-link.png');

    const joinLink = await page.locator('a[href*="/join?t="]').first().getAttribute('href');
    const joinUrl = joinLink?.startsWith('http') ? joinLink : `${BASE}${joinLink}`;

    const studentCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    const studentPage = await studentCtx.newPage();
    await passPreviewGate(studentPage);

    await joinStudent(studentPage, joinUrl, {
      name: 'Preview Handle Student',
      handle: studentHandle,
      password: studentPassword,
    });
    await studentPage.waitForURL(/\/app/, { timeout: 90_000 });
    await shot(studentPage, '05-student-joined-by-handle.png');

    await joinStudent(studentPage, joinUrl, {
      name: 'Duplicate Attempt',
      handle: dupHandle,
      password: studentPassword,
    });
    await studentPage.waitForTimeout(1500);
    await shot(studentPage, '06-duplicate-handle-rejected.png');

    await studentPage.goto(`${BASE}/auth/logout`).catch(() => {});
    await login(studentPage, studentHandle, studentPassword);
    await shot(studentPage, '07-handle-student-login.png');

    const cookies = await studentCtx.cookies();
    const sessionCookie = cookies.find((c) => c.name === 'sessionId' || c.name.includes('session'));
    if (sessionCookie?.expires && sessionCookie.expires > 0) {
      const hours = (sessionCookie.expires * 1000 - Date.now()) / (1000 * 60 * 60);
      const line = `handle session cookie expires in ~${hours.toFixed(1)}h (target ~12h for handle-only accounts)`;
      console.log(line);
      await writeFile(join(OUT, '12h-session-expiry-evidence.txt'), `${line}\n`, 'utf8');
    }

    await page.bringToFront();
    await page.goto(page.url().includes('tab=students') ? page.url() : `${page.url().split('?')[0]}?tab=students`);
    await page.locator('input[name="temporaryPassword"]').fill('temp-preview-1');
    await page.getByRole('button', { name: /reset login/i }).click();
    await page.waitForTimeout(1500);
    await shot(page, '08-teacher-reset-student-password.png');

    const emailCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    const emailPage = await emailCtx.newPage();
    await passPreviewGate(emailPage);
    await login(emailPage, EMAIL_STUDENT, EMAIL_STUDENT_PASSWORD);
    await shot(emailPage, '09-email-student-login.png');

    await page.bringToFront();
    await page.goto(`${BASE}/auth/logout`).catch(() => {});
    await login(page, TEACHER_EMAIL, TEACHER_PASSWORD);
    await shot(page, '10-teacher-email-login.png');

    const cap = Number(process.env.CLASS_FULL_FILL_COUNT ?? '35');
    const fullCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const fullPage = await fullCtx.newPage();
    await passPreviewGate(fullPage);
    for (let i = 0; i < cap; i += 1) {
      await joinStudent(fullPage, joinUrl, {
        name: `Fill ${i}`,
        handle: `fill${run}${i}`.slice(0, 20),
        password: studentPassword,
      });
      if (!(await fullPage.url().includes('/app'))) break;
      await fullPage.goto(`${BASE}/auth/logout`).catch(() => {});
      await passPreviewGate(fullPage);
    }
    await joinStudent(fullPage, joinUrl, {
      name: 'One Too Many',
      handle: `overflow${run}`.slice(0, 20),
      password: studentPassword,
    });
    await fullPage.waitForTimeout(1500);
    await shot(fullPage, '11-class-full-message.png');

    await studentCtx.close();
    await emailCtx.close();
    await fullCtx.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
