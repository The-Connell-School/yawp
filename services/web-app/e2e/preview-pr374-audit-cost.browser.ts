import { chromium } from '@playwright/test';

const previewUrl = process.env.PREVIEW_URL?.replace(/\/$/, '');
const accessCode = process.env.PREVIEW_ACCESS_CODE;
if (!previewUrl || !accessCode) process.exit(1);
const accessCodeValue = accessCode;

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto(`${previewUrl}/`);
  await page.getByLabel('Access code').fill(accessCodeValue);
  await page.getByRole('button', { name: 'Open preview' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/preview-access'), {
    timeout: 60_000,
  });
  await page.evaluate(async () => {
    await fetch('/auth/dev-login', {
      method: 'POST',
      body: new URLSearchParams({ email: 'dev.admin@yawp.local' }),
    });
  });
  await page.goto(`${previewUrl}/app/admin/audit?feature=lesson-planner`);
  await page.waitForLoadState('networkidle');
  const items = page.getByTestId('audit-ai-log-item');
  const count = await items.count();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let cacheCreate = 0;
  for (let i = 0; i < count; i++) {
    await items.nth(i).click();
    const metaText = await items.nth(i).innerText();
    const inM = metaText.match(/Input tokens\s+(\d+)/);
    const outM = metaText.match(/Output tokens\s+(\d+)/);
    const crM = metaText.match(/"cacheReadInputTokens":\s*(\d+)/);
    const ccM = metaText.match(/"cacheCreationInputTokens":\s*(\d+)/);
    if (inM) inputTokens += Number(inM[1]);
    if (outM) outputTokens += Number(outM[1]);
    if (crM) cacheRead += Number(crM[1]);
    if (ccM) cacheCreate += Number(ccM[1]);
  }
  const cost =
    (inputTokens * 3 +
      outputTokens * 15 +
      cacheRead * 0.3 +
      cacheCreate * 3.75) /
    1_000_000;
  console.log(
    JSON.stringify({
      aiLogCount: count,
      inputTokens,
      outputTokens,
      cacheReadInputTokens: cacheRead,
      cacheCreationInputTokens: cacheCreate,
      measuredLessonCostUsd: cost.toFixed(4),
    })
  );
  await browser.close();
}

main();
