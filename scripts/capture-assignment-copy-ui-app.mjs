import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const artifacts = '/opt/cursor/artifacts';
const harnessDir = path.join(artifacts, 'ui-harness');
const screenshotsDir = path.join(artifacts, 'ui-screenshots');

fs.mkdirSync(screenshotsDir, { recursive: true });

const bun = process.env.BUN_BIN ?? '/home/ubuntu/.bun/bin/bun';
execSync(
  `${bun} run scripts/assignment-copy-ui-screenshot-harness.tsx`,
  {
    cwd: path.resolve('services/web-app'),
    stdio: 'inherit',
    env: { ...process.env, SCREENSHOT_HARNESS: '1' },
  }
);

const designHtml =
  process.env.DESIGN_HTML ??
  '/home/ubuntu/.cursor/projects/agent-repos-yawp/uploads/assignments-238f48c7-copy-link_cd6e.html';

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function shotPage(page, file, outName, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`file://${file}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(screenshotsDir, outName),
    fullPage: true,
  });
}

const page = await browser.newPage();

const harnessFiles = fs
  .readdirSync(harnessDir)
  .filter((f) => f.endsWith('.html'));

for (const file of harnessFiles) {
  const base = file.replace(/\.html$/, '');
  const isMobile = base.endsWith('-mobile');
  const viewport = isMobile
    ? { width: 390, height: 844 }
    : { width: 1280, height: 900 };
  await shotPage(
    page,
    path.join(harnessDir, file),
    `${base}.png`,
    viewport
  );
}

await page.setViewportSize({ width: 1440, height: 2000 });
await page.goto(`file://${designHtml}`, {
  waitUntil: 'networkidle',
  timeout: 120_000,
});
await page.waitForTimeout(8_000);

const boards = page.locator('section.board');
const count = await boards.count();
for (let i = 0; i < count; i++) {
  const board = boards.nth(i);
  const label = ((await board.getAttribute('data-name')) ||
    (await board.locator('h2, h3').first().textContent()) ||
    `board-${i}`
  )
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 80);
  if (!/copy|duplicate|student landing|success|detail header/i.test(label)) {
    continue;
  }
  await board.screenshot({
    path: path.join(screenshotsDir, `design-${label}.png`),
  });
}

await browser.close();

const manifest = {
  generatedAt: new Date().toISOString(),
  appScreenshots: harnessFiles.map((f) =>
    f.replace(/\.html$/, '.png')
  ),
  designScreenshots: fs
    .readdirSync(screenshotsDir)
    .filter((f) => f.startsWith('design-')),
  note: 'Compare app-* PNGs to design-* PNGs for the same state; harness uses production CSS without app shell chrome.',
};
fs.writeFileSync(
  path.join(artifacts, 'assignment-copy-ui-screenshots.json'),
  JSON.stringify(manifest, null, 2)
);
console.log('Screenshots written to', screenshotsDir);
