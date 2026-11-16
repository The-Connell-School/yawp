/**
 * Capture PR-preview screenshots for document editor v2 (live app, not design PNGs).
 */
import { mkdir, writeFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { enterPreviewAccess } from '../../../scripts/preview/smoke-login.mjs';
import {
  DEFAULT_PREVIEW_V2_QA_DOCUMENT_ID,
  DEFAULT_PREVIEW_V2_QA_GRADED_DOCUMENT_ID,
  loginPreviewQaStudent,
  openPreviewV2Document,
  resolvePreviewDocumentId,
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
const TEACHER_EMAIL =
  process.env.PREVIEW_TEACHER_EMAIL?.trim() || 'dev.teacher@yawp.local';

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

async function loginTeacher(page) {
  await page.goto(`${BASE}/auth/dev-login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /alex teacher/i }).click();
  await page
    .getByText(/Welcome, Alex Teacher/i)
    .waitFor({ state: 'visible', timeout: 60_000 })
    .catch(() => page.waitForURL(/\/app/, { timeout: 60_000 }));
}

async function shot(page, name, options = {}) {
  const path = join(OUT, `${name}.png`);
  if (options.locator) {
    await page.locator(options.locator).first().screenshot({ path });
  } else if (options.clip) {
    await page.screenshot({ path, clip: options.clip });
  } else {
    await page.screenshot({ path, fullPage: false });
  }
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

  let documentId = DOCUMENT_ID || DEFAULT_PREVIEW_V2_QA_DOCUMENT_ID;
  const gradedDocId =
    process.env.GRADED_DOCUMENT_ID?.trim() || DEFAULT_PREVIEW_V2_QA_GRADED_DOCUMENT_ID;

  await loginPreviewQaStudent(context, BASE, { email: STUDENT_EMAIL });
  const probe = await context.newPage();
  try {
    await openPreviewV2Document(probe, BASE, documentId);
  } catch (error) {
    console.warn(
      `QA document ${documentId} unavailable; discovering (${error instanceof Error ? error.message : error})`
    );
    documentId = await resolvePreviewDocumentId(probe, BASE, {
      preferredId: documentId,
      gradedId: gradedDocId,
    });
  }
  await probe.close();
  console.log('document id', documentId);

  const captures = [];

  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPreviewV2Document(page, BASE, documentId);
    captures.push(await shot(page, '01-student-desktop'));
    await page
      .getByTestId('document-panel-toggles')
      .getByRole('button', { name: /tutor/i })
      .click();
    captures.push(await shot(page, '02-tutor-panel', { locator: '.doc-editor-tutor' }));
    await page
      .getByTestId('document-panel-toggles')
      .getByRole('button', { name: /comments/i })
      .click();
    captures.push(
      await shot(page, '03-comments-margin', {
        locator: '[data-testid="document-margin-comments-aside"]',
      })
    );
    await page.close();
  }

  {
    const page = await context.newPage();
    await loginTeacher(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPreviewV2Document(page, BASE, gradedDocId, '?tab=editor');
    captures.push(await shot(page, '04-teacher-view'));
    await page.close();
  }

  {
    const page = await context.newPage();
    await loginTeacher(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPreviewV2Document(
      page,
      BASE,
      gradedDocId,
      '?tab=editor&v2Capture=comments-reply-resolved'
    );
    await page
      .getByTestId('document-margin-comments-aside')
      .waitFor({ state: 'visible', timeout: 30_000 });
    captures.push(
      await shot(page, '05-comments-reply-resolved', {
        locator: '[data-testid="document-margin-comments-aside"]',
      })
    );
    await page.close();
  }

  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await openPreviewV2Document(page, BASE, documentId, '?tab=editor');
    captures.push(await shot(page, '06-mobile-390'));
    await page.close();
  }

  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPreviewV2Document(page, BASE, documentId, '?v2Capture=saving');
    await page
      .getByTestId('document-save-status')
      .filter({ hasText: /Saving/i })
      .waitFor({ timeout: 15_000 });
    captures.push(
      await shot(page, '07-saving-state', {
        locator: '[data-testid="document-editor-header"]',
      })
    );
    await page.close();
  }

  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPreviewV2Document(page, BASE, documentId, '?v2Capture=submitted');
    await page.getByTestId('document-actions-menu').waitFor({ timeout: 30_000 });
    captures.push(
      await shot(page, '08-submitted-state', {
        locator: '[data-testid="document-editor-header"]',
      })
    );
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