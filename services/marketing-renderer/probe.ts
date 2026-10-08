/**
 * Ground-truth probe, run with bun INSIDE a preview's renderer container:
 * performs the same dev-login the renderer performs, opens the teacher
 * dashboard with the same cookies, and reports what the page actually is.
 * Exists because the renderer's failures on previews have repeatedly been
 * guessed at from the outside; this prints what the browser at that network
 * position really sees.
 *
 *   docker exec <renderer> bash -lc "cd /app/services/marketing-renderer && bun run probe.ts"
 */
import { chromium } from 'playwright';
import {
  fetchPreviewAccessCookies,
  parseSessionCookies,
} from './src/session';

const base = process.env.MARKETING_RENDER_TARGET_URL;
if (!base) throw new Error('MARKETING_RENDER_TARGET_URL is not set');

// Same gate handling as the worker: clear the access gate first, because even
// the dev-login POST is refused without the access cookie.
const accessCode = process.env.MARKETING_RENDERER_ACCESS_CODE?.trim();
let accessCookies: { name: string; value: string; url: string }[] = [];
if (accessCode) {
  accessCookies = await fetchPreviewAccessCookies(base, accessCode);
  console.log('preview access: cleared with a seat code');
}

const loginHeaders: Record<string, string> = {
  'content-type': 'application/x-www-form-urlencoded',
};
if (accessCookies.length > 0) {
  loginHeaders.cookie = accessCookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}
const login = await fetch(new URL('/auth/dev-login', base), {
  method: 'POST',
  headers: loginHeaders,
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
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
await context.addCookies([
  ...accessCookies,
  ...parseSessionCookies(setCookies, base),
]);
const page = await context.newPage();

await page.goto(new URL('/app', base).toString(), {
  waitUntil: 'networkidle',
  timeout: 45_000,
});
await page.waitForTimeout(2_500);

console.log('landed on:', page.url());
console.log('headings:', await page.locator('h1, h2').allInnerTexts());
console.log(
  'Daily Pages link count:',
  await page.getByRole('link', { name: /Daily Pages/i }).count()
);
const bodyText = await page.locator('body').innerText();
console.log('body text head:', bodyText.slice(0, 600).replace(/\n+/g, ' | '));

await browser.close();
console.log('RENDERER_PROBE_DONE');
