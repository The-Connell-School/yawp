import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir =
  process.env.PKG09_OUT_DIR || '/opt/cursor/artifacts/pkg-09-regen';
mkdirSync(outDir, { recursive: true });

const variants = {
  before: {
    grid: 'grid auto-rows-min grid-cols-2 items-start gap-3 lg:grid-cols-3',
    card: 'flex h-auto w-full flex-col self-start overflow-hidden rounded-xl border bg-popover shadow-sm text-left',
    img: 'h-14 w-full sm:h-16 object-cover',
  },
  after: {
    grid: 'grid auto-rows-min grid-cols-2 items-start justify-items-start gap-3 lg:grid-cols-3',
    card: 'flex h-auto w-full max-w-[11rem] flex-col self-start overflow-hidden rounded-xl border bg-popover shadow-sm text-left sm:max-w-[12rem]',
    img: 'aspect-[3/4] h-auto w-full object-cover object-center',
  },
};

function tile(label, v) {
  return `<article class="${v.card}">
    <div class="w-full shrink-0 overflow-hidden">
      <img class="${v.img}" alt="" src="data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='533'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#6366f1'/><stop offset='100%' stop-color='#ec4899'/></linearGradient></defs><rect width='100%' height='100%' fill='url(%23g)'/><text x='50%' y='50%' fill='white' font-size='28' text-anchor='middle' dominant-baseline='middle' font-family='system-ui'>${label}</text></svg>`
      )}" />
    </div>
    <div class="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-1.5 sm:py-2">
      <span class="text-sm font-semibold">${label}</span>
      <span class="text-xs text-muted-foreground">Unlimited</span>
    </div>
  </article>`;
}

function pageHtml(which) {
  const v = variants[which];
  const tiles = ['Class Starter', 'Prewriting', 'Thesis Statement']
    .map((label) => tile(label, v))
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body{font-family:system-ui,sans-serif;background:#f8fafc;padding:24px}</style>
</head>
<body>
  <p class="mb-4 text-sm text-slate-600">PKG-09 fixture (${which}) — assignment image tiles</p>
  <div class="${v.grid}">${tiles}</div>
</body>
</html>`;
}

for (const which of ['before', 'after']) {
  const htmlPath = join(outDir, `${which}.html`);
  writeFileSync(htmlPath, pageHtml(which));
}

const viewports = [
  ['desktop', 1280, 720],
  ['tablet', 834, 720],
  ['mobile', 390, 720],
];

const browser = await chromium.launch({ headless: true });
for (const which of ['before', 'after']) {
  const htmlPath = join(outDir, `${which}.html`);
  for (const [label, width, height] of viewports) {
    const page = await browser.newPage();
    await page.setViewportSize({ width, height });
    await page.goto(`file://${htmlPath}`);
    await page.waitForTimeout(400);
    const png = join(outDir, `${which}-${label}.png`);
    await page.screenshot({ path: png });
    await page.close();
    console.log('Wrote', png);
  }
}
await browser.close();
