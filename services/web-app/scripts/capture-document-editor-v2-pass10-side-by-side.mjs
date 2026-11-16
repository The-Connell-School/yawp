/**
 * Pass 10: per-state design | preview side-by-side + pixel diff.
 *
 *   PREVIEW_BASE_URL=https://pr-963.preview.yawp.school \
 *   PREVIEW_ACCESS_CODE=<code> \
 *   bun run services/web-app/scripts/capture-document-editor-v2-pass10-side-by-side.mjs
 */
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
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
import { computeDesignPreviewDiff } from './document-editor-v2-pass10-pixel-diff.mjs';

const STUDENT_EMAIL =
  process.env.PREVIEW_STUDENT_EMAIL?.trim() || 'dev.student@yawp.local';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const DESIGN_DIR = join(ROOT, 'docs/design/document-editor-v2');
const EVIDENCE = join(ROOT, 'docs/design/evidence/document-editor-v2-pass10');
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

async function sectionRow(page, heading) {
  const section = page
    .getByRole('heading', { name: heading, exact: true })
    .locator('xpath=ancestor::section[1]');
  await section.scrollIntoViewIfNeeded();
  return section.locator(':scope > div').nth(1);
}

async function captureDesign(browser, spec, outPath) {
  const page = await browser.newPage();
  await page.setViewportSize(spec.viewport ?? { width: 1440, height: 900 });
  await page.goto(`file://${join(DESIGN_DIR, spec.designFile)}`, {
    waitUntil: 'networkidle',
  });
  if (spec.fullViewport) {
    await page.screenshot({ path: outPath, fullPage: false });
    await page.close();
    return outPath;
  }
  if (spec.section) {
    const row = await sectionRow(page, spec.section);
    if (spec.sectionCardFilter) {
      const card = row
        .locator('div')
        .filter({ hasText: spec.sectionCardFilter })
        .first();
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: outPath });
    } else if (spec.sectionFrameIndex != null) {
      const frame = row.locator(':scope > div').nth(spec.sectionFrameIndex);
      await frame.scrollIntoViewIfNeeded();
      await frame.screenshot({ path: outPath });
    } else {
      await row.screenshot({ path: outPath });
    }
    await page.close();
    return outPath;
  }
  if (spec.clip) {
    await page.screenshot({ path: outPath, clip: spec.clip });
  } else {
    await page.screenshot({ path: outPath, fullPage: false });
  }
  await page.close();
  return outPath;
}

async function stitchSideBySide(slug, designPath, previewPath) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const designB64 = (await readFile(designPath)).toString('base64');
  const previewB64 = (await readFile(previewPath)).toString('base64');
  const out = join(EVIDENCE, `${slug}-side-by-side.png`);
  await page.setContent(`<!DOCTYPE html>
<html><body style="margin:0;display:flex;gap:0;background:#111">
<img alt="design" src="data:image/png;base64,${designB64}" style="height:100vh;width:auto;object-fit:contain" />
<img alt="preview" src="data:image/png;base64,${previewB64}" style="height:100vh;width:auto;object-fit:contain" />
</body></html>`);
  await page.setViewportSize({ width: 3200, height: 1400 });
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  await cp(out, join(ARTIFACTS, `${slug}-side-by-side.png`));
  return out;
}

async function openStudentV2(page, docId, query = '') {
  const q = query.startsWith('?') ? query : query ? `?${query}` : '';
  await openPreviewV2Document(page, BASE, docId, q);
}

async function loginTeacher(page) {
  await page.goto(`${BASE}/auth/dev-login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /alex teacher/i }).click();
  await page
    .getByText(/Welcome, Alex Teacher/i)
    .waitFor({ state: 'visible', timeout: 60_000 })
    .catch(() => {});
}

async function capturePreview(browser, pair, ids) {
  const { slug, preview: spec } = pair;
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await passGate(context);
  const page = await context.newPage();
  await page.setViewportSize(spec.viewport ?? { width: 1440, height: 900 });

  const docId =
    spec.doc === 'graded' ? ids.gradedDocId : ids.docId;
  if (spec.login === 'teacher') {
    await loginTeacher(page);
  } else {
    await loginPreviewQaStudent(context, BASE, { email: STUDENT_EMAIL });
  }

  const query = [
    spec.query,
    spec.v2Capture ? `v2Capture=${spec.v2Capture}` : null,
    spec.tab ? `tab=${spec.tab}` : null,
  ]
    .filter(Boolean)
    .join('&');

  await openStudentV2(page, docId, query ? `?${query}` : '');

  if (spec.setup) await spec.setup(page, ids);

  const outPath = join(EVIDENCE, `${slug}-preview.png`);
  if (spec.captureChromeStack) {
    await page.getByTestId('document-editor-header').waitFor();
    await page.getByTestId('document-editor-workspace-chrome').waitFor();
    const box1 = await page.getByTestId('document-editor-header').boundingBox();
    const box2 = await page
      .getByTestId('document-editor-workspace-chrome')
      .boundingBox();
    if (box1 && box2) {
      const top = Math.min(box1.y, box2.y);
      const bottom = Math.max(box1.y + box1.height, box2.y + box2.height);
      await page.screenshot({
        path: outPath,
        clip: {
          x: 0,
          y: Math.max(0, Math.floor(top)),
          width: spec.viewport?.width ?? 1440,
          height: Math.ceil(bottom - top),
        },
      });
      await cp(outPath, join(ARTIFACTS, `${slug}-preview.png`));
      await context.close();
      return outPath;
    }
  }
  if (spec.locator) {
    const el = page.locator(spec.locator).first();
    await el.waitFor({ state: 'visible', timeout: 60_000 });
    await el.screenshot({ path: outPath });
  } else if (spec.clip) {
    await page.screenshot({ path: outPath, clip: spec.clip });
  } else {
    await page.screenshot({ path: outPath, fullPage: false });
  }

  await cp(outPath, join(ARTIFACTS, `${slug}-preview.png`));
  await context.close();
  return outPath;
}

const PAIRS = [
  {
    slug: 'student-desktop-1440',
    design: { designFile: 'document-editor.html', fullViewport: true },
    preview: {
      setup: async (page) => {
        await page.getByTestId('document-editor-header').waitFor();
      },
    },
  },
  {
    slug: 'mobile-390',
    design: {
      designFile: 'document-editor-states.html',
      section: 'Mobile (390)',
      sectionFrameIndex: 0,
    },
    preview: {
      viewport: { width: 390, height: 844 },
      tab: 'editor',
      setup: async (page) => {
        const editorTab = page
          .getByTestId('document-mobile-tabbar')
          .getByRole('button', { name: /editor|write/i });
        if (await editorTab.isVisible().catch(() => false)) {
          await editorTab.click();
        }
      },
    },
  },
  {
    slug: 'tutor-panel',
    design: {
      designFile: 'document-editor-states.html',
      section: 'Tutor panel',
      sectionFrameIndex: 0,
    },
    preview: {
      setup: async (page) => {
        await page
          .getByTestId('document-panel-toggles')
          .getByRole('button', { name: /tutor/i })
          .click();
        await page.getByTestId('tutor-module-header').waitFor();
      },
      locator: '.doc-editor-tutor',
    },
  },
  {
    slug: 'comments-margin',
    design: {
      designFile: 'document-editor-states.html',
      section: 'Comments',
      sectionFrameIndex: 0,
    },
    preview: {
      setup: async (page) => {
        await page
          .getByTestId('document-panel-toggles')
          .getByRole('button', { name: /comments/i })
          .click();
        await page
          .getByTestId('document-margin-comments-aside')
          .waitFor({ state: 'visible', timeout: 30_000 });
      },
      locator: '[data-testid="document-margin-comments-aside"]',
    },
  },
  {
    slug: 'comments-reply-resolved',
    design: {
      designFile: 'document-editor-states.html',
      section: 'Comments',
      sectionFrameIndex: 1,
    },
    preview: {
      doc: 'graded',
      login: 'teacher',
      v2Capture: 'comments-reply-resolved',
      query: 'tab=editor',
      setup: async (page) => {
        await page
          .getByTestId('document-margin-comments-aside')
          .waitFor({ state: 'visible', timeout: 30_000 });
        await page
          .getByTestId('comment-reply-expanded-previewdocv2commentact01')
          .waitFor({ state: 'visible', timeout: 30_000 })
          .catch(() => {});
        await page
          .getByTestId('margin-comment-resolved-expanded-previewdocv2commentres01')
          .waitFor({ state: 'visible', timeout: 30_000 })
          .catch(() => {});
      },
      locator: '[data-testid="document-margin-comments-aside"]',
    },
  },
  {
    slug: 'chrome-toolbar-prompt',
    design: {
      designFile: 'document-editor-states.html',
      section: 'Toolbar and prompt',
      sectionFrameIndex: 0,
    },
    preview: {
      captureChromeStack: true,
    },
  },
  {
    slug: 'top-bar',
    design: {
      designFile: 'document-editor-states.html',
      section: 'Top bar',
      sectionCardFilter: 'Saved',
    },
    preview: {
      locator: '[data-testid="document-editor-header"]',
    },
  },
  {
    slug: 'teacher-view-only',
    design: {
      designFile: 'document-editor-states.html',
      section: 'Full views',
      sectionCardFilter: "Riley's tutor",
    },
    preview: {
      doc: 'graded',
      login: 'teacher',
      query: 'tab=editor',
      setup: async (page) => {
        await page.getByTestId('document-teacher-student-name').waitFor();
      },
    },
  },
  {
    slug: 'view-only',
    design: {
      designFile: 'document-editor-states.html',
      section: 'Toolbar and prompt',
      sectionCardFilter: 'Viewing only',
    },
    preview: {
      doc: 'graded',
      login: 'teacher',
      query: 'tab=editor',
      setup: async (page) => {
        await page.getByTestId('document-view-only-banner').waitFor();
      },
      locator: '.doc-editor-toolbar-glass',
    },
  },
  {
    slug: 'loading',
    design: {
      designFile: 'document-editor-states.html',
      section: 'Full views',
      sectionCardFilter: 'Step 6 of 8',
    },
    preview: { v2Capture: 'loading', locator: '[data-v2-capture="loading"]' },
  },
  {
    slug: 'empty',
    design: {
      designFile: 'document-editor-states.html',
      section: 'Top bar',
      sectionCardFilter: "can't submit",
    },
    preview: {
      v2Capture: 'empty',
      setup: async (page) => {
        await page.getByTestId('document-submit-empty-trigger').waitFor();
      },
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    },
  },
  {
    slug: 'error',
    design: {
      designFile: 'document-editor-states.html',
      section: 'Top bar',
      sectionCardFilter: 'Save error',
    },
    preview: {
      v2Capture: 'error',
      setup: async (page) => {
        await page
          .getByTestId('document-save-status')
          .filter({ hasText: /Save error/i })
          .waitFor();
      },
      locator: '[data-testid="document-editor-header"]',
    },
  },
  {
    slug: 'saving',
    design: {
      designFile: 'document-editor-states.html',
      section: 'Top bar',
      sectionCardFilter: 'Saving',
    },
    preview: {
      v2Capture: 'saving',
      setup: async (page) => {
        await page
          .getByTestId('document-save-status')
          .filter({ hasText: /Saving/i })
          .waitFor();
      },
      locator: '[data-testid="document-editor-header"]',
    },
  },
  {
    slug: 'submitted',
    design: {
      designFile: 'document-editor-states.html',
      section: 'Top bar',
      sectionCardFilter: 'Submitted',
    },
    preview: {
      v2Capture: 'submitted',
      setup: async (page) => {
        await page
          .getByTestId('document-actions-menu')
          .waitFor({ state: 'visible', timeout: 30_000 });
      },
      locator: '[data-testid="document-editor-header"]',
    },
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
  await loginPreviewQaStudent(probeContext, BASE, { email: STUDENT_EMAIL });
  const probe = await probeContext.newPage();
  const docId = await resolvePreviewDocumentId(probe, BASE, {
    preferredId: process.env.DOCUMENT_ID?.trim() || DEFAULT_PREVIEW_V2_QA_DOCUMENT_ID,
    gradedId:
      process.env.GRADED_DOCUMENT_ID?.trim() || DEFAULT_PREVIEW_V2_QA_GRADED_DOCUMENT_ID,
  });
  await probeContext.close();

  const ids = {
    docId,
    gradedDocId:
      process.env.GRADED_DOCUMENT_ID?.trim() || DEFAULT_PREVIEW_V2_QA_GRADED_DOCUMENT_ID,
  };

  const manifest = {
    baseUrl: BASE,
    documentId: ids.docId,
    gradedDocumentId: ids.gradedDocId,
    pairs: [],
    diffTable: [],
  };

  for (const pair of PAIRS) {
    const designPath = join(EVIDENCE, `${pair.slug}-design.png`);
    await captureDesign(browser, pair.design, designPath);
    const previewPath = await capturePreview(browser, pair, ids);
    const sideBySide = await stitchSideBySide(pair.slug, designPath, previewPath);
    const diffPath = join(EVIDENCE, `${pair.slug}-diff.png`);
    const diff = computeDesignPreviewDiff(designPath, previewPath, diffPath);
    manifest.pairs.push({
      slug: pair.slug,
      design: designPath,
      preview: previewPath,
      sideBySide,
      diffPath,
      diffPercent: Number(diff.diffPercent.toFixed(2)),
    });
    manifest.diffTable.push({
      state: pair.slug,
      diffPercent: Number(diff.diffPercent.toFixed(2)),
      notes: diff.diffPercent > 3 ? 'review' : 'ok',
    });
  }

  await writeFile(join(EVIDENCE, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(join(ARTIFACTS, 'pass10-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});