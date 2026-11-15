/**
 * Capture PR-preview screenshots for document editor v2 (live app, not design PNGs).
 *
 *   PREVIEW_BASE_URL=https://pr-956.preview.yawp.school \
 *   PREVIEW_ACCESS_CODE=bright-fox-5251 \
 *   DOCUMENT_ID=<cuid> \
 *   bun run scripts/capture-document-editor-v2-preview.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  enterPreviewAccess,
  runLoginSmoke,
} from '../../../scripts/preview/smoke-login.mjs';

const BASE = process.env.PREVIEW_BASE_URL?.replace(/\/$/, '');
const ACCESS_CODE = process.env.PREVIEW_ACCESS_CODE?.trim();
const DOCUMENT_ID = process.env.DOCUMENT_ID?.trim();
const OUT =
  process.env.CAPTURE_OUT_DIR?.trim() ||
  join(fileURLToPath(new URL('.', import.meta.url)), '../../../artifacts/document-editor-v2-preview');

const STUDENT_EMAIL =
  process.env.PREVIEW_STUDENT_EMAIL?.trim() || 'jdoe@brock.software';
const STUDENT_PASSWORD = process.env.PREVIEW_STUDENT_PASSWORD ?? 'johndoe';
const TEACHER_EMAIL =
  process.env.PREVIEW_TEACHER_EMAIL?.trim() || 'teacher.e2e@yawp.test';
const TEACHER_PASSWORD = process.env.PREVIEW_TEACHER_PASSWORD ?? 'teacher-e2e-password';
const ADMIN_EMAIL =
  process.env.PREVIEW_ADMIN_EMAIL?.trim() || 'admin.e2e@yawp.test';
const ADMIN_PASSWORD = process.env.PREVIEW_ADMIN_PASSWORD ?? 'admin-e2e-password';

async function passGate(context) {
  if (!ACCESS_CODE) throw new Error('PREVIEW_ACCESS_CODE is required');
  const accessCookie = await enterPreviewAccess({
    baseUrl: BASE,
    accessCode: ACCESS_CODE,
  });
  const { hostname } = new URL(BASE);
  const cookies = accessCookie.split('; ').filter(Boolean).map((pair) => {
    const eq = pair.indexOf('=');
    return {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      domain: hostname,
      path: '/',
    };
  });
  await context.addCookies(cookies);
}

async function login(page, email, password) {
  await runLoginSmoke({
    baseUrl: BASE,
    email,
    password,
    accessCode: ACCESS_CODE,
  });
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
  await page.getByLabel(/email/i).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /^log in$/i }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 60_000 });
}

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log('saved', path);
  return path;
}

async function openDoc(page, docId, query = '') {
  await page.goto(`${BASE}/app/documents/${docId}${query}`, {
    waitUntil: 'networkidle',
  });
  await page
    .locator('[data-document-editor-version="v2"]')
    .waitFor({ state: 'visible', timeout: 45_000 });
}

async function discoverDocumentId(page) {
  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  const href = await page
    .locator('a[href*="/app/documents/"]')
    .first()
    .getAttribute('href');
  if (!href) throw new Error('No /app/documents/ link found after login');
  const match = href.match(/\/app\/documents\/([^/?#]+)/);
  if (!match) throw new Error(`Could not parse document id from ${href}`);
  return match[1];
}

async function main() {
  if (!BASE) throw new Error('PREVIEW_BASE_URL is required');
  await mkdir(OUT, { recursive: true });
  let documentId = DOCUMENT_ID;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await passGate(context);

  const captures = [];

  if (!documentId) {
    const probe = await context.newPage();
    await login(probe, STUDENT_EMAIL, STUDENT_PASSWORD);
    documentId = await discoverDocumentId(probe);
    await probe.close();
    console.log('discovered document id', documentId);
  }

  {
    const page = await context.newPage();
    await login(page, STUDENT_EMAIL, STUDENT_PASSWORD);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openDoc(page, documentId);
    captures.push(await shot(page, '01-student-desktop'));
    await page.getByRole('button', { name: /tutor/i }).first().click().catch(() => {});
    await shot(page, '02-tutor-panel');
    await page.getByRole('button', { name: /comments/i }).first().click().catch(() => {});
    await shot(page, '03-comments-margin');
    await page.close();
  }

  {
    const page = await context.newPage();
    await login(page, TEACHER_EMAIL, TEACHER_PASSWORD);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openDoc(page, documentId);
    captures.push(await shot(page, '04-teacher-view'));
    await page.getByRole('button', { name: /show old comments/i }).click().catch(() => {});
    captures.push(await shot(page, '05-comments-reply-resolved'));
    await page.close();
  }

  {
    const page = await context.newPage();
    await login(page, STUDENT_EMAIL, STUDENT_PASSWORD);
    await page.setViewportSize({ width: 390, height: 844 });
    await openDoc(page, documentId);
    captures.push(await shot(page, '06-mobile-390'));
    await page.close();
  }

  {
    const page = await context.newPage();
    await login(page, STUDENT_EMAIL, STUDENT_PASSWORD);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openDoc(page, documentId);
    const submit = page.getByTestId('document-submit-button');
    if (await submit.isVisible()) {
      await submit.click();
      await page.getByTestId('document-finalize-submit').click().catch(() => {});
      await page.waitForTimeout(1500);
    }
    captures.push(await shot(page, '07-submitted-state'));
    await page.close();
  }

  {
    const page = await context.newPage();
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openDoc(page, documentId, '?editor=v1');
    await page
      .locator('[data-document-editor-version="v1"]')
      .waitFor({ state: 'visible', timeout: 45_000 });
    captures.push(await shot(page, '08-staff-v1-opt-out'));
    await page.close();
  }

  const manifest = {
    baseUrl: BASE,
    documentId,
    captures,
    designSources: [
      'Claude Design export: document-editor.html (Student editor)',
      'Claude Design export: document-editor-states.html (Editor states)',
    ],
  };
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});