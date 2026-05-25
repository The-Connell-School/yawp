/**
 * PR preview smoke (Playwright). CI sets PREVIEW_BASE_URL after Preview Forge is up.
 *
 *   PREVIEW_BASE_URL=https://pr-123.preview.yawp.school bun run scripts/smoke-pr-preview.mjs
 *
 * Seeded users: packages/prisma/scripts/seed-overlay.ts.
 */
import { chromium } from 'playwright';

const BASE =
  process.env.PREVIEW_BASE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:5173';

const DEFAULT_EMAIL =
  process.env.PREVIEW_EMAIL?.trim() || 'teacher.e2e@yawp.test';
const DEFAULT_PASSWORD =
  process.env.PREVIEW_PASSWORD ?? 'teacher-e2e-password';

const steps = [];

function ok(name) {
  steps.push({ name, ok: true });
  console.log(`OK  ${name}`);
}

function fail(name, err) {
  steps.push({ name, ok: false, err: String(err?.message || err) });
  console.error(`FAIL ${name}:`, err);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);

  try {
    await page.goto(`${BASE}/api/healthcheck`, { waitUntil: 'networkidle' });
    const healthText = await page.locator('body').innerText();
    if (!healthText || healthText.length < 2) throw new Error('empty health body');
    ok('GET /api/healthcheck');

    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
    await page.getByLabel(/email/i).waitFor({ state: 'visible' });
    ok('GET /auth/login');

    await page.getByLabel(/email/i).fill(DEFAULT_EMAIL);
    await page.locator('input[type="password"]').fill(DEFAULT_PASSWORD);
    await page.getByRole('button', { name: /^log in$/i }).click();
    await page.waitForURL(/\/app(\/|$)/, { timeout: 60_000 });
    ok('Sign in → app');

    console.log('\n--- smoke result ---');
    console.log(JSON.stringify({ baseUrl: BASE, steps }, null, 2));
  } catch (e) {
    fail('smoke', e);
    await page.screenshot({ path: '/tmp/yawp-smoke-fail.png', fullPage: true }).catch(() => {});
    console.error('Screenshot: /tmp/yawp-smoke-fail.png');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
