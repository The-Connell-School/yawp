/**
 * Screenshot Claude Design HTML exports (local file://, not live app).
 *
 *   bun run services/web-app/scripts/capture-document-editor-v2-design-states.mjs
 *
 * Output: docs/design/evidence/document-editor-v2-pass8/design-*.png
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const DESIGN_DIR = join(ROOT, 'docs/design/document-editor-v2');
const OUT = join(
  ROOT,
  'docs/design/evidence/document-editor-v2-pass8'
);

const STATES = [
  { name: 'student-desktop', file: 'document-editor.html', width: 1440, height: 900 },
  {
    name: 'states-board-full',
    file: 'document-editor-states.html',
    width: 1440,
    height: 900,
    fullPage: true,
  },
];

async function shot(page, name) {
  const path = join(OUT, `design-${name}.png`);
  await page.screenshot({ path, fullPage: !!page._fullPage });
  console.log('saved', path);
  return path;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const captures = [];

  for (const state of STATES) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: state.width, height: state.height });
    const fileUrl = `file://${join(DESIGN_DIR, state.file)}`;
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    page._fullPage = state.fullPage;
    captures.push(await shot(page, state.name));
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify({ outDir: OUT, captures }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});