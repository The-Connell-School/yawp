import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const artifacts = '/opt/cursor/artifacts';
const designHtml =
  process.env.DESIGN_HTML ??
  '/home/ubuntu/.cursor/projects/agent-repos-yawp/uploads/assignments-238f48c7-copy-link_cd6e.html';

fs.mkdirSync(artifacts, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto(`file://${designHtml}`, { waitUntil: 'networkidle', timeout: 120_000 });
await page.waitForTimeout(8_000);

const targets = [
  { name: 'design-detail-header-states', match: /detail header states/i },
  { name: 'design-builder-success-states', match: /success states/i },
  { name: 'design-student-landing-desktop', match: /student landing pages \(desktop\)/i },
  { name: 'design-duplicate-assign-desktop', match: /Duplicate · Assign to · desktop/i },
];

for (const { name, match } of targets) {
  const section = page.locator('section.board').filter({ hasText: match }).first();
  if ((await section.count()) === 0) continue;
  await section.screenshot({ path: path.join(artifacts, `${name}.png`) });
}

await page.setViewportSize({ width: 390, height: 844 });
const mobile = page.locator('section.board').filter({
  hasText: /student landing pages \(mobile\)/i,
});
if ((await mobile.count()) > 0) {
  await mobile.first().screenshot({
    path: path.join(artifacts, 'design-student-landing-mobile.png'),
  });
}

await browser.close();
console.log('Wrote design reference screenshots to', artifacts);
