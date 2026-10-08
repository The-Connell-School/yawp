/**
 * PR #414 preview visual QA (run locally; never commit access codes).
 *
 * Required env:
 *   QA_PREVIEW_FREE_CLASSROOM_ONE_CLICK_URL — one-click URL for the Free classroom seat
 *     (from PR preview deploy logs: "Preview seat … (Free classroom): …")
 *   QA_PREVIEW_MASTER_ONE_CLICK_URL — optional, for school reporter nav shot
 *
 * Writes PNGs under ./qa-414-output/ (gitignored).
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const outDir = new URL('./qa-414-output/', import.meta.url).pathname;
const baseUrl = process.env.QA_PREVIEW_FREE_CLASSROOM_ONE_CLICK_URL;
if (!baseUrl) throw new Error('Set QA_PREVIEW_FREE_CLASSROOM_ONE_CLICK_URL');
const siteOrigin = baseUrl.replace(/\?.*$/, '');
const password = 'yawp-dev';

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(120_000);

async function login(email, accessUrl = baseUrl, reset = false) {
  if (reset) await page.context().clearCookies();
  await page.goto(accessUrl);
  await page.waitForLoadState('networkidle');
  await page.goto(`${siteOrigin}/auth/login`);
  await page.locator('input[type="email"]').waitFor();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/app'), { timeout: 120_000 });
}

await login('dev.teacher.free@yawp.local');
// … extend with the seven screenshot steps from the ship review checklist.
await browser.close();
console.log(`Wrote captures under ${outDir}`);
