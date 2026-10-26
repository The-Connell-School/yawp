import { chromium } from 'playwright';
import {
  mkdirSync,
  copyFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;
const DATE = '2026-10-26';
const DOCS_BASE = join(REPO_ROOT, 'docs/design/ui-pause-review', DATE);
const BOX_DESIGN_BASE = join(REPO_ROOT, 'design/ui-pause-review', DATE);
const ARTIFACTS_BASE = join('/opt/cursor/artifacts/ui-pause-review', DATE);
const MASTER_PREVIEW_CODE = 'yawp-rocks';
const FREE_CLASSROOM = 'Yawp Preview — Free Classroom';
const BUN = process.env.BUN_BIN || '/home/ubuntu/.bun/bin/bun';

const PREVIEWS = {
  847: { code: 'merry-heron-9851', host: 'https://pr-847.preview.yawp.school' },
  848: { code: 'happy-otter-4651', host: 'https://pr-848.preview.yawp.school' },
  850: { code: 'swift-wren-1836', host: 'https://pr-850.preview.yawp.school' },
  851: { code: 'steady-robin-9737', host: 'https://pr-851.preview.yawp.school' },
  852: { code: 'happy-panda-7794', host: 'https://pr-852.preview.yawp.school' },
};

const DEMO = 'https://demo.yawp.school';
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

function outDirs(pr) {
  for (const d of [
    join(DOCS_BASE, String(pr)),
    join(ARTIFACTS_BASE, String(pr)),
    join(BOX_DESIGN_BASE, String(pr)),
  ]) {
    mkdirSync(d, { recursive: true });
  }
}

function shotPath(pr, filename) {
  return join(DOCS_BASE, String(pr), filename);
}

function mirrorShot(pr, filename) {
  const src = shotPath(pr, filename);
  for (const dest of [
    join(ARTIFACTS_BASE, String(pr), filename),
    join(BOX_DESIGN_BASE, String(pr), filename),
  ]) {
    if (existsSync(src)) copyFileSync(src, dest);
  }
}

async function capture(page, pr, filename, opts = {}) {
  outDirs(pr);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(400);
  const path = shotPath(pr, filename);
  await page.screenshot({ path, animations: 'disabled', ...opts });
  mirrorShot(pr, filename);
  console.log('CAPTURED', path);
}

async function postWake(baseUrl, accessCode) {
  const wakeUrl = `${baseUrl}/__wake?code=${encodeURIComponent(accessCode)}`;
  const res = await fetch(wakeUrl, {
    method: 'POST',
    headers: { 'x-preview-wake': '1' },
  }).catch(() => null);
  return Boolean(res && (res.status === 202 || res.status === 200));
}

async function ensurePreviewAwake(page, baseUrl, accessCode) {
  const landing = `${baseUrl}/?code=${encodeURIComponent(accessCode)}`;
  for (let attempt = 0; attempt < 18; attempt++) {
    await page.goto(landing, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    const body = await page.content();
    if (/Waking preview/i.test(body)) {
      await postWake(baseUrl, accessCode);
      await page.waitForTimeout(10_000);
      continue;
    }
    if (!/503|Service Unavailable/i.test(body)) return;
    await postWake(baseUrl, accessCode);
    await page.waitForTimeout(12_000);
  }
  throw new Error(`Preview did not wake: ${baseUrl}`);
}

async function unlockFreeClassroomOrg(page, baseUrl) {
  await page.request.post(`${baseUrl}/auth/preview-access`, {
    form: { code: MASTER_PREVIEW_CODE, returnTo: '/auth/login' },
  });
  await page.goto(`${baseUrl}/auth/preview-access?returnTo=/auth/login`, {
    waitUntil: 'domcontentloaded',
  });
  const orgSelect = page.locator('#preview-organization-id');
  if (await orgSelect.isVisible().catch(() => false)) {
    await orgSelect.selectOption({ label: FREE_CLASSROOM });
    await page.getByRole('button', { name: /continue to organization/i }).click();
    await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  }
}

/** Verified preview path: wake → yawp-rocks + Free Classroom once → PR sticky one-click → login. */
async function preparePreview(page, baseUrl, stickyCode) {
  await page.goto(`${baseUrl}/?code=${encodeURIComponent(stickyCode)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  });
  if ((await page.content()).match(/Waking preview/i)) {
    await postWake(baseUrl, stickyCode);
    await page.goto(`${baseUrl}/?code=${encodeURIComponent(stickyCode)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    });
  }
  await unlockFreeClassroomOrg(page, baseUrl);
  await page.goto(`${baseUrl}/?code=${encodeURIComponent(stickyCode)}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.goto(`${baseUrl}/auth/login`, { waitUntil: 'domcontentloaded' });
  const beakerCount = await page
    .locator('.local-dev-environment-control button')
    .count();
  if (!beakerCount) {
    throw new Error(`Dev login beaker missing on ${baseUrl}/auth/login`);
  }
}

async function openLegacyBeaker(page) {
  const trigger = page
    .getByRole('button', { name: /open dev login menu/i })
    .or(page.locator('.local-dev-environment-control button'));
  await trigger.first().click({ timeout: 60_000 });
  await page.locator('#local-dev-quick-login-panel').waitFor({
    state: 'visible',
    timeout: 90_000,
  });
}

const DEV_LOGIN_EMAIL = {
  alex: 'dev.teacher@yawp.local',
  admin: 'dev.admin@yawp.local',
};

async function signInPreviewUser(page, baseUrl, who) {
  const email = DEV_LOGIN_EMAIL[who];
  const response = await page.request.post(`${baseUrl}/auth/dev-login`, {
    form: {
      email,
      password: 'yawp-dev',
      redirectTo: '/app',
    },
  });
  if (!response.ok() && response.status() !== 302) {
    throw new Error(
      `dev-login failed for ${email}: ${response.status()} ${await response.text()}`
    );
  }
  await page.goto(`${baseUrl}/app`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function unlockDemoDevPanel(page) {
  await page.goto(`${DEMO}/auth/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /open developer tools/i }).click();
  const locked = page.getByText('Developer tools are locked');
  if (await locked.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /enter access code/i }).click();
    await page.locator('#dev-panel-access-code').fill(MASTER_PREVIEW_CODE);
    await page.getByRole('button', { name: /unlock developer tools/i }).click();
    await page.waitForTimeout(1000);
  }
}

async function openDevPanel(page) {
  const beaker = page.getByRole('button', { name: /open developer tools/i });
  const panel = page.locator('#devtools');
  if (!(await panel.isVisible().catch(() => false))) {
    await beaker.click({ timeout: 60_000 });
  }
  await panel.waitFor({ state: 'visible', timeout: 90_000 });
  return panel;
}

async function expandFreeTierGroups(sheet) {
  for (const title of ['Teacher signup', 'Pending approval', 'Approved', 'Admin-side']) {
    const groupTrigger = sheet.getByRole('button', { name: new RegExp(title, 'i') });
    if (await groupTrigger.count()) {
      if ((await groupTrigger.getAttribute('aria-expanded')) !== 'true') {
        await groupTrigger.click();
      }
    }
  }
}

async function jumpFreeTierStateDemo(page, stateLabel) {
  await page.evaluate(() => localStorage.removeItem('yawp-dev-panel'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  const panel = await openDevPanel(page);
  await panel.getByRole('button', { name: /^Free-tier states/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Free-tier states' });
  await sheet.waitFor({ state: 'visible', timeout: 30_000 });
  await expandFreeTierGroups(sheet);
  const throwaway = sheet.getByRole('checkbox', { name: /throwaway test account/i });
  if (!(await throwaway.isChecked())) await throwaway.check();
  await sheet.getByPlaceholder(/filter states/i).fill(stateLabel);
  await sheet
    .locator('label')
    .filter({ hasText: stateLabel })
    .getByRole('radio')
    .first()
    .check({ force: true });
  const jump = page.waitForResponse(
    (r) =>
      r.url().includes('/api/dev-panel/free-tier-jump') &&
      r.request().method() === 'POST',
    { timeout: 180_000 }
  );
  await sheet.getByRole('button', { name: /jump to this state/i }).click();
  const response = await jump;
  const body = await response.json().catch(() => ({}));
  if (!response.ok() || body?.ok !== true) {
    throw new Error(`Demo jump "${stateLabel}" failed: ${JSON.stringify(body)}`);
  }
  if (body.redirectTo) await page.goto(body.redirectTo);
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function capture848DemoBefore(page) {
  await jumpFreeTierStateDemo(page, 'Usage: a few left');
  for (const [vp, suffix] of [
    [DESKTOP, 'desktop'],
    [MOBILE, 'mobile'],
  ]) {
    await page.setViewportSize(vp);
    await page.goto(`${DEMO}/app`);
    await capture(page, 848, `before-dashboard-tiles-${suffix}.png`);
    await page.goto(`${DEMO}/app/lesson-planner`);
    await capture(page, 848, `before-sidebar-lp-reporter-${suffix}.png`, {
      fullPage: true,
    });
  }
}

async function capture848PreviewAfter(page, host, code) {
  await preparePreview(page, host, code);
  await signInPreviewUser(page, host, 'alex');
  for (const [vp, suffix] of [
    [DESKTOP, 'desktop'],
    [MOBILE, 'mobile'],
  ]) {
    await page.setViewportSize(vp);
    await page.goto(`${host}/app`);
    await capture(page, 848, `after-dashboard-tiles-${suffix}.png`);
    await page.goto(`${host}/app/lesson-planner`);
    await capture(page, 848, `after-sidebar-lp-reporter-${suffix}.png`, {
      fullPage: true,
    });
  }
}

async function capture850DemoBefore(page) {
  await jumpFreeTierStateDemo(page, 'Waiting on admin approval');
  for (const [vp, suffix] of [
    [DESKTOP, 'desktop'],
    [MOBILE, 'mobile'],
  ]) {
    await page.setViewportSize(vp);
    await page.goto(`${DEMO}/app/free-tier/pending`);
    await capture(page, 850, `before-pending-page-${suffix}.png`, { fullPage: true });
  }
}

async function capture850PreviewAfter(page, host, code) {
  await preparePreview(page, host, code);
  await signInPreviewUser(page, host, 'alex');
  for (const [vp, suffix] of [
    [DESKTOP, 'desktop'],
    [MOBILE, 'mobile'],
  ]) {
    await page.setViewportSize(vp);
    await page.goto(`${host}/app/free-tier/pending`);
    await capture(page, 850, `after-pending-page-${suffix}.png`, { fullPage: true });
  }
}

async function capture851Preview(page, host, code) {
  await preparePreview(page, host, code);
  await signInPreviewUser(page, host, 'alex');
  await page.setViewportSize(DESKTOP);
  await page.goto(`${host}/app`);
  await capture(page, 851, 'after-approved-see-how-desktop.png', { fullPage: true });
  await page.setViewportSize(MOBILE);
  await page.goto(`${host}/app`);
  await capture(page, 851, 'after-approved-see-how-mobile.png', { fullPage: true });
  await page.goto(`${host}/app/reporter`);
  await capture(page, 851, 'after-reporter-sidebar-desktop.png', { fullPage: true });
  await page.setViewportSize(MOBILE);
  await page.goto(`${host}/app/reporter`);
  await capture(page, 851, 'after-reporter-sidebar-mobile.png', { fullPage: true });
}

async function capture852Preview(page, host, code) {
  await preparePreview(page, host, code);
  await signInPreviewUser(page, host, 'admin');
  await page.setViewportSize(DESKTOP);
  await page.goto(`${host}/app/admin/assignments`);
  await capture(page, 852, 'after-admin-assignments-list-desktop.png', { fullPage: true });
  await page.locator('a[href*="/app/admin/assignment-types/"]').first().click({
    timeout: 60_000,
  });
  await capture(page, 852, 'after-admin-assignment-type-edit-desktop.png', {
    fullPage: true,
  });
  await page.setViewportSize(MOBILE);
  await page.goto(`${host}/app/admin/assignments`);
  await capture(page, 852, 'after-admin-assignments-list-mobile.png', { fullPage: true });
}

async function capture847Preview(page, host, code) {
  await preparePreview(page, host, code);
  await signInPreviewUser(page, host, 'alex');
  await page.setViewportSize(DESKTOP);
  await page.goto(`${host}/app`);
  await capture(page, 847, 'after-preview-dashboard.png', { fullPage: true });
}

function copy847Fixtures() {
  const regenDir = '/opt/cursor/artifacts/pkg-09-regen';
  const regen = spawnSync(BUN, [join(REPO_ROOT, 'scripts/qa/pkg-09-tile-before-after.mjs')], {
    cwd: join(REPO_ROOT, 'services/web-app'),
    env: {
      ...process.env,
      PKG09_OUT_DIR: regenDir,
      PATH: `/home/ubuntu/.bun/bin:${process.env.PATH || ''}`,
    },
    stdio: 'inherit',
  });
  if (regen.status !== 0) throw new Error('847 fixture regen failed');
  for (const n of [
    'before-desktop.png',
    'before-tablet.png',
    'before-mobile.png',
    'after-desktop.png',
    'after-tablet.png',
    'after-mobile.png',
  ]) {
    const src = join(regenDir, n);
    if (!existsSync(src)) throw new Error(`missing ${src}`);
    copyFileSync(src, shotPath(847, n));
    mirrorShot(847, n);
    console.log('COPIED 847', n);
  }
}

function syncBoxDesignIntoDocs() {
  if (!existsSync(BOX_DESIGN_BASE)) return [];
  const copied = [];
  for (const pr of ['847', '848', '850', '851', '852']) {
    const srcDir = join(BOX_DESIGN_BASE, pr);
    if (!existsSync(srcDir)) continue;
    outDirs(pr);
    for (const name of readdirSync(srcDir)) {
      if (!name.endsWith('.png')) continue;
      const src = join(srcDir, name);
      if (!statSync(src).isFile()) continue;
      copyFileSync(src, shotPath(pr, name));
      mirrorShot(pr, name);
      copied.push(shotPath(pr, name));
    }
  }
  return copied;
}

const only = process.env.CAPTURE_ONLY?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const failures = [];

async function run(name, fn) {
  if (only && !only.includes(name)) return;
  try {
    await fn();
  } catch (err) {
    failures.push({ name, error: String(err) });
    console.error('FAILED', name, err);
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
context.setDefaultNavigationTimeout(180_000);
context.setDefaultTimeout(120_000);
const page = await context.newPage();

await run('sync-box', async () => {
  const copied = syncBoxDesignIntoDocs();
  console.log('SYNC_BOX', copied.length, 'files');
});

await run('847-fixtures', async () => copy847Fixtures());
await run('847-preview', async () => {
  const { host, code } = PREVIEWS[847];
  await capture847Preview(page, host, code);
});
await run('848-demo-before', async () => {
  await unlockDemoDevPanel(page);
  await capture848DemoBefore(page);
});
await run('848', async () => {
  const { host, code } = PREVIEWS[848];
  await capture848PreviewAfter(page, host, code);
});
await run('850-demo-before', async () => {
  await unlockDemoDevPanel(page);
  await capture850DemoBefore(page);
});
await run('850', async () => {
  const { host, code } = PREVIEWS[850];
  await capture850PreviewAfter(page, host, code);
});
await run('851', async () => {
  const { host, code } = PREVIEWS[851];
  await capture851Preview(page, host, code);
});
await run('852', async () => {
  const { host, code } = PREVIEWS[852];
  await capture852Preview(page, host, code);
});

await run('sync-box-final', async () => {
  syncBoxDesignIntoDocs();
});

await context.close();
await browser.close();

console.log(JSON.stringify({ failures, docsBase: DOCS_BASE, artifactsBase: ARTIFACTS_BASE }, null, 2));
process.exit(failures.length ? 1 : 0);
