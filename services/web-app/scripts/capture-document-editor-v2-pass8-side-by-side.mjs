/**
 * Build design vs preview side-by-side PNGs for pass 8 QA.
 *
 *   PREVIEW_BASE_URL=https://pr-963.preview.yawp.school \
 *   PREVIEW_ACCESS_CODE=<code> \
 *   DOCUMENT_ID=<cuid> \
 *   bun run services/web-app/scripts/capture-document-editor-v2-pass8-side-by-side.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  enterPreviewAccess,
  runLoginSmoke,
} from '../../../scripts/preview/smoke-login.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const DESIGN_DIR = join(ROOT, 'docs/design/document-editor-v2');
const EVIDENCE = join(ROOT, 'docs/design/evidence/document-editor-v2-pass8');

const BASE = process.env.PREVIEW_BASE_URL?.replace(/\/$/, '');
const ACCESS_CODE = process.env.PREVIEW_ACCESS_CODE?.trim();
const DOCUMENT_ID = process.env.DOCUMENT_ID?.trim();
const STUDENT_EMAIL =
  process.env.PREVIEW_STUDENT_EMAIL?.trim() || 'dev.student@yawp.local';

const PAIRS = [
  {
    slug: 'student-desktop-1440',
    designFile: 'document-editor.html',
    designViewport: { width: 1440, height: 900 },
    previewViewport: { width: 1440, height: 900 },
    afterLogin: async (page) => {
      await openDoc(page);
    },
  },
  {
    slug: 'mobile-390',
    designFile: 'document-editor-states.html',
    designViewport: { width: 390, height: 844 },
    previewViewport: { width: 390, height: 844 },
    designClipHeight: 900,
    afterLogin: async (page) => {
      await openDoc(page, '?tab=editor');
    },
  },
];

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

async function loginDev(page) {
  await page.goto(`${BASE}/auth/dev-login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /casey student/i }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 60_000 });
}

async function openDoc(page, query = '') {
  const docId = page._docId;
  await page.goto(`${BASE}/app/documents/${docId}${query}?editor=v2`, {
    waitUntil: 'networkidle',
  });
  await page
    .locator('[data-document-editor-version="v2"]')
    .waitFor({ state: 'visible', timeout: 45_000 });
}

async function captureDesign(browser, pair) {
  const page = await browser.newPage();
  await page.setViewportSize(pair.designViewport);
  await page.goto(`file://${join(DESIGN_DIR, pair.designFile)}`, {
    waitUntil: 'networkidle',
  });
  const path = join(EVIDENCE, `${pair.slug}-design.png`);
  await page.screenshot({
    path,
    fullPage: false,
    clip: pair.designClipHeight
      ? {
          x: 0,
          y: 0,
          width: pair.designViewport.width,
          height: pair.designClipHeight,
        }
      : undefined,
  });
  await page.close();
  return path;
}

async function capturePreview(browser, pair, docId) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await passGate(context);
  const page = await context.newPage();
  page._docId = docId;
  await page.setViewportSize(pair.previewViewport);
  try {
    await loginDev(page);
  } catch (err) {
    console.warn('dev-login failed, using password login', err);
    await runLoginSmoke({
      baseUrl: BASE,
      email: STUDENT_EMAIL,
      password: process.env.PREVIEW_STUDENT_PASSWORD ?? 'yawp-dev',
      accessCode: ACCESS_CODE,
    });
    await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  }
  await pair.afterLogin(page);
  const path = join(EVIDENCE, `${pair.slug}-preview.png`);
  await page.screenshot({ path, fullPage: false });
  await context.close();
  return path;
}

async function stitchSideBySide(slug, designPath, previewPath) {
  const page = await (await chromium.launch({ headless: true })).newPage();
  const designB64 = (await readFile(designPath)).toString('base64');
  const previewB64 = (await readFile(previewPath)).toString('base64');
  const out = join(EVIDENCE, `${slug}-side-by-side.png`);
  await page.setContent(`<!DOCTYPE html>
<html><body style="margin:0;display:flex;gap:0;background:#111">
<img alt="design" src="data:image/png;base64,${designB64}" style="max-height:100vh" />
<img alt="preview" src="data:image/png;base64,${previewB64}" style="max-height:100vh" />
</body></html>`);
  await page.setViewportSize({ width: 3200, height: 1200 });
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  return out;
}

async function discoverDocumentId(page) {
  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  const href = await page
    .locator('a[href*="/app/documents/"]')
    .first()
    .getAttribute('href');
  const match = href?.match(/\/app\/documents\/([^/?#]+)/);
  if (!match) throw new Error('No document link on /app');
  return match[1];
}

async function main() {
  if (!BASE) throw new Error('PREVIEW_BASE_URL is required');
  await mkdir(EVIDENCE, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  let docId = DOCUMENT_ID;
  if (!docId) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await passGate(ctx);
    const probe = await ctx.newPage();
    try {
      await loginDev(probe);
    } catch {
      await runLoginSmoke({
        baseUrl: BASE,
        email: STUDENT_EMAIL,
        password: 'yawp-dev',
        accessCode: ACCESS_CODE,
      });
      await probe.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
    }
    docId = await discoverDocumentId(probe);
    await ctx.close();
    console.log('discovered document', docId);
  }

  const manifest = { baseUrl: BASE, documentId: docId, pairs: [] };

  for (const pair of PAIRS) {
    const design = await captureDesign(browser, pair);
    const preview = await capturePreview(browser, pair, docId);
    const sideBySide = await stitchSideBySide(pair.slug, design, preview);
    manifest.pairs.push({
      slug: pair.slug,
      design,
      preview,
      sideBySide,
    });
  }

  await writeFile(
    join(EVIDENCE, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log(JSON.stringify(manifest, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});