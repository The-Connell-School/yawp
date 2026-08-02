/**
 * Ground-truth probe, run with bun INSIDE a preview's renderer container:
 * performs the same dev-login the renderer performs, opens /app/assignments
 * with the same cookies, and reports what the page actually is. Exists
 * because the renderer's failures on previews have repeatedly been guessed
 * at from the outside; this prints what the browser at that network position
 * really sees.
 *
 *   docker exec <renderer> bash -lc "cd /app && bun run scripts/preview/renderer-probe.ts"
 */
import { chromium } from 'playwright';
import { parseSessionCookies } from '../../services/marketing-renderer/src/session';

const base = process.env.MARKETING_RENDER_TARGET_URL;
if (!base) throw new Error('MARKETING_RENDER_TARGET_URL is not set');

const login = await fetch(new URL('/auth/dev-login', base), {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email: 'dev.teacher@yawp.local' }).toString(),
  redirect: 'manual',
});
console.log('dev-login status:', login.status, 'location:', login.headers.get('location'));
const setCookies = login.headers.getSetCookie();
console.log(
  'set-cookies:',
  setCookies.map((c) => `${c.split(';')[0].split('=')[0]} [${c.split(';').slice(1).join(' ').trim()}]`)
);

const chromiumPath =
  process.env.MARKETING_RENDERER_CHROMIUM_PATH?.trim() || undefined;
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addCookies(parseSessionCookies(setCookies, base));
const page = await context.newPage();

await page.goto(new URL('/app/assignments', base).toString(), {
  waitUntil: 'networkidle',
  timeout: 45_000,
});
await page.waitForTimeout(2_500);

console.log('landed on:', page.url());
console.log('headings:', await page.locator('h1, h2').allInnerTexts());
console.log(
  'assignments table count:',
  await page.locator("table[aria-label='Assignments']").count()
);
const bodyText = await page.locator('body').innerText();
console.log('body text head:', bodyText.slice(0, 600).replace(/\n+/g, ' | '));

await browser.close();
console.log('RENDERER_PROBE_DONE');
