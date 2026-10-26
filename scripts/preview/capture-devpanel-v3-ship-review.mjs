/**
 * Capture dev panel v3 §(d) implementation PNGs @ 1280×800 on a PR preview.
 *
 * Usage:
 *   PREVIEW_BASE_URL=https://pr-860.preview.yawp.school \
 *   PREVIEW_ACCESS_CODE=brave-panda-6669 \
 *   node scripts/preview/capture-devpanel-v3-ship-review.mjs
 */
import { mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
  enterPreviewAccess,
  loginCookieHeader,
} from './smoke-login.mjs';

const BASE = process.env.PREVIEW_BASE_URL?.replace(/\/$/, '');
const ACCESS_CODE = process.env.PREVIEW_ACCESS_CODE?.trim();
const TEACHER_EMAIL =
  process.env.PREVIEW_TEACHER_EMAIL?.trim() || 'dev.teacher@yawp.local';
const TEACHER_PASSWORD = process.env.PREVIEW_TEACHER_PASSWORD ?? 'yawp-dev';

const OUT_DIR =
  process.env.DEVPANEL_IMPL_DIR ??
  join(process.cwd(), 'design/devpanel-v3/impl-2026-10-26');
const ART_DIR = process.env.DEVPANEL_ARTIFACT_DIR ?? '/opt/cursor/artifacts';

const FRAMES = [
  '01-locked-beaker-desktop-1280.png',
  '02-unlocked-default-desktop-1280.png',
  '03-give-feedback-flyout-desktop-1280.png',
  '04-free-tier-flyout-desktop-1280.png',
  '05-signed-out-free-feedback-desktop-1280.png',
];

function cookieHeaderToPlaywright(cookieHeader, url) {
  const { hostname } = new URL(url);
  return cookieHeader
    .split('; ')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      return { name, value, domain: hostname, path: '/' };
    });
}

async function saveShot(page, filename) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);
  const outPath = join(OUT_DIR, filename);
  await page.screenshot({ path: outPath, fullPage: false });
  await copyFile(outPath, join(ART_DIR, filename));
  console.log('saved', outPath);
}

async function waitDevPanelReady(page) {
  const panel = page.locator('#devtools');
  await panel.waitFor({ state: 'visible', timeout: 60_000 });
  await panel.waitFor({ state: 'attached' });
  await page.waitForFunction(
    () =>
      document.querySelector('#devtools')?.getAttribute('data-yawp-dev-panel-ready') ===
      'true',
    null,
    { timeout: 60_000 }
  );
}

async function openDevToolsPanel(page) {
  const panel = page.locator('#devtools');
  if (await panel.isVisible().catch(() => false)) {
    await waitDevPanelReady(page);
    return panel;
  }
  const beaker = page.locator('.yawp-dev-panel-beaker button');
  await beaker.waitFor({ state: 'visible', timeout: 120_000 });
  await beaker.click();
  await panel.waitFor({ state: 'visible', timeout: 30_000 });
  await waitDevPanelReady(page);
  return panel;
}

async function clearDevPanelStorage(page) {
  await page.evaluate(() => localStorage.removeItem('yawp-dev-panel'));
}

async function collapseDevPanelSections(page, panel) {
  for (const name of [
    'Sign in as',
    'Blackboard link',
    'Tester tools',
  ]) {
    const trigger = panel.getByRole('button', {
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
    });
    if (!(await trigger.count())) continue;
    if ((await trigger.getAttribute('aria-expanded')) === 'true') {
      await trigger.click();
    }
  }
  const signIn = panel.getByRole('button', { name: /^Sign in as\b/ });
  if ((await signIn.getAttribute('aria-expanded')) === 'true') {
    await signIn.click();
  }
}

async function main() {
  if (!BASE || !ACCESS_CODE) {
    throw new Error('PREVIEW_BASE_URL and PREVIEW_ACCESS_CODE are required');
  }
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(ART_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });

  const accessCookie = await enterPreviewAccess({
    baseUrl: BASE,
    accessCode: ACCESS_CODE,
  });
  await context.addCookies(cookieHeaderToPlaywright(accessCookie, BASE));

  const teacherCookies = await loginCookieHeader({
    baseUrl: BASE,
    email: TEACHER_EMAIL,
    password: TEACHER_PASSWORD,
    accessCode: ACCESS_CODE,
    redirectTo: '/app/assignments',
  });

  // —— Frame 01: signed-in teacher, beaker visible, panel closed ——
  // (Master preview seat unlocks dev tools; lock badge may be absent vs design frame 01.)
  {
    const page = await context.newPage();
    await context.addCookies(cookieHeaderToPlaywright(teacherCookies, BASE));
    await page.goto(`${BASE}/app/assignments`, { waitUntil: 'domcontentloaded' });
    await clearDevPanelStorage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.yawp-dev-panel-beaker button').waitFor({
      state: 'visible',
      timeout: 120_000,
    });
    await saveShot(page, FRAMES[0]);
    await page.close();
  }

  // —— Frames 02–04: signed-in teacher, panel unlocked (master seat) ——
  {
    const page = await context.newPage();
    await context.addCookies(cookieHeaderToPlaywright(teacherCookies, BASE));
    await page.goto(`${BASE}/app/assignments`, { waitUntil: 'domcontentloaded' });
    await clearDevPanelStorage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });

    const panel = await openDevToolsPanel(page);
    await collapseDevPanelSections(page, panel);
    await saveShot(page, FRAMES[1]);

    await panel.getByRole('button', { name: /^Give feedback\b/ }).click();
    await page.getByRole('dialog', { name: 'Give feedback' }).waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await saveShot(page, FRAMES[2]);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await openDevToolsPanel(page);
    await panel.getByRole('button', { name: /^Free-tier states/ }).click();
    const stateSheet = page.getByRole('dialog', { name: 'Free-tier states' });
    await stateSheet.waitFor({ state: 'visible', timeout: 15_000 });
    const approvedGroup = stateSheet.getByRole('button', {
      name: /^Approved\b/,
    });
    if ((await approvedGroup.getAttribute('aria-expanded')) !== 'true') {
      await approvedGroup.click();
    }
    await stateSheet
      .getByRole('button', { name: /^Usage: a few left\b/ })
      .click();
    await saveShot(page, FRAMES[3]);
    await page.close();
  }

  // —— Frame 05: signed out on /free with Give feedback ——
  {
    const page = await context.newPage();
    await context.clearCookies();
    await context.addCookies(cookieHeaderToPlaywright(accessCookie, BASE));
    await page.goto(`${BASE}/free`, { waitUntil: 'domcontentloaded' });
    await clearDevPanelStorage(page);
    const panel = await openDevToolsPanel(page);
    await panel.getByRole('button', { name: /^Give feedback\b/ }).click();
    await page.getByRole('dialog', { name: 'Give feedback' }).waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await saveShot(page, FRAMES[4]);
    await page.close();
  }

  await browser.close();
  console.log('done', OUT_DIR);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
