/**
 * Capture PR-preview screenshots for document editor v2 (live app, not design PNGs).
 */
import { mkdir, writeFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { enterPreviewAccess, runLoginSmoke } from '../../../scripts/preview/smoke-login.mjs';
import {
  DEFAULT_PREVIEW_V2_QA_DOCUMENT_ID,
  DEFAULT_PREVIEW_V2_QA_GRADED_DOCUMENT_ID,
  openPreviewV2Document,
  resolvePreviewDocumentId,
  waitForDevLoginShell,
} from './document-editor-v2-preview-discovery.mjs';

const BASE = process.env.PREVIEW_BASE_URL?.replace(/\/$/, '');
const ACCESS_CODE = process.env.PREVIEW_ACCESS_CODE?.trim();
const DOCUMENT_ID = process.env.DOCUMENT_ID?.trim();
const OUT =
  process.env.CAPTURE_OUT_DIR?.trim() ||
  join(fileURLToPath(new URL('.', import.meta.url)), '../../../artifacts/document-editor-v2-preview');
const ARTIFACTS = '/opt/cursor/artifacts';

const STUDENT_EMAIL =
  process.env.PREVIEW_STUDENT_EMAIL?.trim() || 'dev.student@yawp.local';
const STUDENT_PASSWORD = process.env.PREVIEW_STUDENT_PASSWORD ?? 'yawp-dev';
const TEACHER_EMAIL =
  process.env.PREVIEW_TEACHER_EMAIL?.trim() || 'dev.teacher@yawp.local';
const TEACHER_PASSWORD = process.env.PREVIEW_TEACHER_PASSWORD ?? 'yawp-dev';

async function passGate(context) {
  if (!ACCESS_CODE) throw new Error('PREVIEW_ACCESS_CODE is required');
  const accessCookie = await enterPreviewAccess({
    baseUrl: BASE,
    accessCode: ACCESS_CODE,
  });
  const { hostname } = new URL(BASE);
  await context.addCookies(
    accessCookie.split('; ').filter(Boolean).map((pair) => {
      const eq = pair.indexOf('=');
      return {
        name: pair.slice(0, eq),
        value: pair.slice(eq + 1),
        domain: hostname,
        path: '/',
      };
    })
  );
}

async function loginStudent(page) {
  await page.goto(`${BASE}/auth/dev-login`, { waitUntil: 'networkidle' });
  try {
    await waitForDevLoginShell(page);
    return;
  } catch {
    await runLoginSmoke({
      baseUrl: BASE,
      email: STUDENT_EMAIL,
      password: STUDENT_PASSWORD,
      accessCode: ACCESS_CODE,
    });
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
    await page.getByLabel(/email/i).fill(STUDENT_EMAIL);
    await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: /^log in$/i }).click();
    await page.waitForURL(/\/app(\/|$)/, { timeout: 60_000 });
  }
}

async function loginTeacher(page) {
  await page.goto(`${BASE}/auth/dev-login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /alex teacher/i }).click();
  await page
    .getByText(/Welcome, Alex Teacher/i)
    .waitFor({ state: 'visible', timeout: 60_000 })
    .catch(() => page.waitForURL(/\/app/, { timeout: 60_000 }));
}

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await cp(path, join(ARTIFACTS, `preview-${name}.png`)).catch(() => {});
  console.log('saved', path);
  return path;
}

async function main() {
  if (!BASE) throw new Error('PREVIEW_BASE_URL is required');
  await mkdir(OUT, { recursive: true });
  await mkdir(ARTIFACTS, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await passGate(context);

  const probe = await context.newPage();
  await loginStudent(probe);
  const documentId = await resolvePreviewDocumentId(probe, BASE, {
    preferredId: DOCUMENT_ID || DEFAULT_PREVIEW_V2_QA_DOCUMENT_ID,
    gradedId: process.env.GRADED_DOCUMENT_ID?.trim() || DEFAULT_PREVIEW_V2_QA_GRADED_DOCUMENT_ID,
  });
  await probe.close();
  console.log('document id', documentId);

  const gradedDocId =
    process.env.GRADED_DOCUMENT_ID?.trim() || DEFAULT_PREVIEW_V2_QA_GRADED_DOCUMENT_ID;

  const captures = [];

  {
    const page = await context.newPage();
    await loginStudent(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPreviewV2Document(page, BASE, documentId);
    captures.push(await shot(page, '01-student-desktop'));
    await page.getByTestId('document-panel-toggles').getByRole('button', { name: /tutor/i }).click();
    await shot(page, '02-tutor-panel');
    await page.getByTestId('document-panel-toggles').getByRole('button', { name: /comments/i }).click();
    captures.push(await shot(page, '03-comments-margin'));
    await page.close();
  }

  {
    const page = await context.newPage();
    await loginTeacher(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPreviewV2Document(page, BASE, gradedDocId, '?tab=editor');
    captures.push(await shot(page, '04-teacher-view'));
    await page.getByRole('button', { name: /show old comments/i }).click().catch(() => {});
    captures.push(await shot(page, '05-comments-reply-resolved'));
    await page.close();
  }

  {
    const page = await context.newPage();
    await loginStudent(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openPreviewV2Document(page, BASE, documentId, '?tab=editor');
    captures.push(await shot(page, '06-mobile-390'));
    await page.close();
  }

  {
    const page = await context.newPage();
    await loginStudent(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPreviewV2Document(page, BASE, documentId);
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.type(' Saving pulse');
    await page.getByTestId('document-save-status').getAttribute('data-sync-status');
    captures.push(await shot(page, '07-saving-state'));
    await page.close();
  }

  {
    const page = await context.newPage();
    await loginStudent(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPreviewV2Document(page, BASE, documentId);
    const submit = page.getByTestId('document-submit-button');
    if (await submit.isVisible()) {
      await submit.click();
      await page.getByTestId('document-finalize-submit').click().catch(() => {});
      await page.waitForTimeout(1500);
    }
    captures.push(await shot(page, '08-submitted-state'));
    await page.close();
  }

  const manifest = { baseUrl: BASE, documentId, gradedDocumentId: gradedDocId, captures };
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(join(ARTIFACTS, 'preview-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});