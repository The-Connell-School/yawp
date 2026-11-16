/**
 * Pass 9: design vs PR-preview side-by-side PNGs for merge-gate evidence.
 *
 *   PREVIEW_BASE_URL=https://pr-963.preview.yawp.school \
 *   PREVIEW_ACCESS_CODE=<code> \
 *   DOCUMENT_ID=previewdoceditv2qa0001 \
 *   bun run services/web-app/scripts/capture-document-editor-v2-pass9-side-by-side.mjs
 */
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { enterPreviewAccess } from '../../../scripts/preview/smoke-login.mjs';
import {
  DEFAULT_PREVIEW_V2_QA_DOCUMENT_ID,
  DEFAULT_PREVIEW_V2_QA_GRADED_DOCUMENT_ID,
  openPreviewV2Document,
  resolvePreviewDocumentId,
  waitForDevLoginShell,
} from './document-editor-v2-preview-discovery.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const DESIGN_DIR = join(ROOT, 'docs/design/document-editor-v2');
const EVIDENCE = join(ROOT, 'docs/design/evidence/document-editor-v2-pass9');
const ARTIFACTS = '/opt/cursor/artifacts';

const BASE = process.env.PREVIEW_BASE_URL?.replace(/\/$/, '');
const ACCESS_CODE = process.env.PREVIEW_ACCESS_CODE?.trim();

async function passGate(context) {
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

async function captureDesign(browser, pair) {
  const page = await browser.newPage();
  await page.setViewportSize(pair.designViewport);
  await page.goto(`file://${join(DESIGN_DIR, pair.designFile)}`, {
    waitUntil: 'networkidle',
  });
  if (pair.designClipSelector) {
    await page.locator(pair.designClipSelector).first().scrollIntoViewIfNeeded();
    const path = join(EVIDENCE, `${pair.slug}-design.png`);
    await page.locator(pair.designClipSelector).first().screenshot({ path });
    await page.close();
    return path;
  }
  const path = join(EVIDENCE, `${pair.slug}-design.png`);
  await page.screenshot({
    path,
    fullPage: false,
    clip: pair.designClip,
  });
  await page.close();
  return path;
}

async function stitchSideBySide(slug, designPath, previewPath) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const designB64 = (await readFile(designPath)).toString('base64');
  const previewB64 = (await readFile(previewPath)).toString('base64');
  const out = join(EVIDENCE, `${slug}-side-by-side.png`);
  await page.setContent(`<!DOCTYPE html>
<html><body style="margin:0;display:flex;gap:0;background:#111">
<img alt="design" src="data:image/png;base64,${designB64}" style="max-height:100vh" />
<img alt="preview" src="data:image/png;base64,${previewB64}" style="max-height:100vh" />
</body></html>`);
  await page.setViewportSize({ width: 3200, height: 1400 });
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  await cp(out, join(ARTIFACTS, `${slug}-side-by-side.png`));
  return out;
}

async function captureStudentScene(browser, docId, slug, setup) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await passGate(context);
  const page = await context.newPage();
  await page.goto(`${BASE}/auth/dev-login`, { waitUntil: 'networkidle' });
  await waitForDevLoginShell(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPreviewV2Document(page, BASE, docId);
  if (setup) await setup(page);
  const path = join(EVIDENCE, `${slug}-preview.png`);
  if (slug === 'mobile-390') {
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.screenshot({ path, fullPage: false });
  await cp(path, join(ARTIFACTS, `${slug}-preview.png`));
  await context.close();
  return path;
}

async function captureTeacherScene(browser, gradedDocId, slug) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await passGate(context);
  const page = await context.newPage();
  await page.goto(`${BASE}/auth/dev-login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /alex teacher/i }).click();
  await page.getByText(/Welcome, Alex Teacher/i).waitFor({ timeout: 60_000 }).catch(() => {});
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPreviewV2Document(page, BASE, gradedDocId, '?tab=editor');
  const path = join(EVIDENCE, `${slug}-preview.png`);
  await page.screenshot({ path, fullPage: false });
  await cp(path, join(ARTIFACTS, `${slug}-preview.png`));
  await context.close();
  return path;
}

const PAIRS = [
  {
    slug: 'student-desktop-1440',
    designFile: 'document-editor.html',
    designViewport: { width: 1440, height: 900 },
    capture: (browser, docId) => captureStudentScene(browser, docId, 'student-desktop-1440'),
  },
  {
    slug: 'mobile-390',
    designFile: 'document-editor-states.html',
    designViewport: { width: 390, height: 844 },
    designClip: { x: 0, y: 0, width: 390, height: 900 },
    capture: (browser, docId) =>
      captureStudentScene(browser, docId, 'mobile-390', async (page) => {
        await page.getByTestId('document-mobile-tabbar').getByRole('button', { name: /editor/i }).click();
      }),
  },
  {
    slug: 'tutor-panel',
    designFile: 'document-editor-states.html',
    designViewport: { width: 1440, height: 900 },
    designClip: { x: 80, y: 320, width: 380, height: 720 },
    capture: (browser, docId) =>
      captureStudentScene(browser, docId, 'tutor-panel', async (page) => {
        await page.getByTestId('document-panel-toggles').getByRole('button', { name: /tutor/i }).click();
        await page.getByTestId('tutor-module-header').waitFor({ state: 'visible', timeout: 15_000 });
      }),
  },
  {
    slug: 'comments-margin',
    designFile: 'document-editor-states.html',
    designViewport: { width: 1440, height: 900 },
    designClip: { x: 980, y: 200, width: 420, height: 760 },
    capture: (browser, docId) =>
      captureStudentScene(browser, docId, 'comments-margin', async (page) => {
        await page.getByTestId('document-panel-toggles').getByRole('button', { name: /comments/i }).click();
        await page.getByTestId('document-margin-comments-aside').waitFor({ state: 'visible', timeout: 15_000 });
        await page.locator('[data-testid^="margin-comment-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });
      }),
  },
  {
    slug: 'chrome-toolbar-prompt',
    designFile: 'document-editor.html',
    designViewport: { width: 1440, height: 900 },
    capture: (browser, docId) =>
      captureStudentScene(browser, docId, 'chrome-toolbar-prompt', async (page) => {
        await page.getByTestId('document-editor-header').waitFor({ state: 'visible' });
      }),
  },
  {
    slug: 'teacher-view-only',
    designFile: 'document-editor-states.html',
    designViewport: { width: 1440, height: 900 },
    designClip: { x: 0, y: 0, width: 1440, height: 900 },
    capture: (browser, _docId, gradedDocId) =>
      captureTeacherScene(browser, gradedDocId, 'teacher-view-only'),
  },
];

async function main() {
  if (!BASE) throw new Error('PREVIEW_BASE_URL is required');
  if (!ACCESS_CODE) throw new Error('PREVIEW_ACCESS_CODE is required');
  await mkdir(EVIDENCE, { recursive: true });
  await mkdir(ARTIFACTS, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  const probeContext = await browser.newContext({ ignoreHTTPSErrors: true });
  await passGate(probeContext);
  const probe = await probeContext.newPage();
  await probe.goto(`${BASE}/auth/dev-login`, { waitUntil: 'networkidle' });
  await waitForDevLoginShell(probe);
  const docId = await resolvePreviewDocumentId(probe, BASE, {
    preferredId: process.env.DOCUMENT_ID?.trim() || DEFAULT_PREVIEW_V2_QA_DOCUMENT_ID,
    gradedId:
      process.env.GRADED_DOCUMENT_ID?.trim() || DEFAULT_PREVIEW_V2_QA_GRADED_DOCUMENT_ID,
  });
  await probeContext.close();
  console.log('document id', docId);

  const gradedDocId =
    process.env.GRADED_DOCUMENT_ID?.trim() || DEFAULT_PREVIEW_V2_QA_GRADED_DOCUMENT_ID;

  const manifest = { baseUrl: BASE, documentId: docId, gradedDocumentId: gradedDocId, pairs: [] };

  for (const pair of PAIRS) {
    const design = await captureDesign(browser, pair);
    const preview = await pair.capture(browser, docId, gradedDocId);
    const sideBySide = await stitchSideBySide(pair.slug, design, preview);
    manifest.pairs.push({ slug: pair.slug, design, preview, sideBySide });
  }

  await writeFile(join(EVIDENCE, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(join(ARTIFACTS, 'pass9-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});