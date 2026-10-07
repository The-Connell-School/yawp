/**
 * Headless Playwright capture for Free Tier C ship review on a PR preview.
 *
 * Required env:
 *   PREVIEW_BASE_URL — e.g. https://pr-416.preview.yawp.school
 *   PREVIEW_ACCESS_CODE — preview seat code (never log)
 *
 * Optional:
 *   SHIP_REVIEW_OUT_DIR — defaults to ./ship-review-screenshots
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = (process.env.PREVIEW_BASE_URL || '').replace(/\/$/, '');
const accessCode = process.env.PREVIEW_ACCESS_CODE || '';
const outDir = path.resolve(process.env.SHIP_REVIEW_OUT_DIR || 'ship-review-screenshots');
const password = process.env.SHIP_REVIEW_TEACHER_PASSWORD || 'yawp-dev';
const RELEASE_EMAIL = 'shipreview-released@yawp.invalid';
const PENDING_EMAIL = 'shipreview-pending@yawp.invalid';

if (!baseUrl || !accessCode) {
  console.error('PREVIEW_BASE_URL and PREVIEW_ACCESS_CODE are required');
  process.exit(1);
}

async function enterPreview(page) {
  await page.goto(baseUrl);
  const codeInput = page.locator('input[name="code"]');
  if ((await codeInput.count()) > 0) {
    await codeInput.fill(accessCode);
    await page
      .locator('form')
      .filter({ has: codeInput })
      .first()
      .evaluate((form) => form.requestSubmit());
    await page.waitForLoadState('networkidle');
  }
}

async function devLogin(page, email) {
  await page.goto(`${baseUrl}/auth/dev-login`);
  await page.fill('input[name="email"]', email);
  await page.locator('form').evaluate((form) => form.requestSubmit());
  await page.waitForLoadState('networkidle');
}

async function passwordLogin(page, email) {
  await page.goto(`${baseUrl}/auth/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.locator('form').evaluate((form) => form.requestSubmit());
  await page.waitForLoadState('networkidle');
}

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function fetchManifest(page, email) {
  const res = await page.request.get(
    `${baseUrl}/api/preview/qa/free-tier-manifest?email=${encodeURIComponent(email)}`
  );
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`manifest ${res.status()}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function freshContext(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await enterPreview(page);
  return { context, page };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const manifest = { capturedAt: new Date().toISOString(), baseUrl, shots: [] };

  try {
    {
      const { context, page } = await freshContext(browser);
      await page.goto(`${baseUrl}/free`);
      manifest.shots.push(await shot(page, '01-free-waitlist'));
      await page.fill('input[name="name"]', 'Ship Review Waitlist');
      await page.fill('input[name="email"]', `shipreview-waitlist+${Date.now()}@shipreview.invalid`);
      await page.fill('input[name="schoolName"]', 'Ship Review High');
      await page.fill('input[name="location"]', 'Preview');
      await page.fill('input[name="gradeLevel"]', '9');
      await page.locator('button[type="submit"]').click();
      await page.waitForSelector("text=You're on the list", { timeout: 15_000 });
      manifest.shots.push(await shot(page, '02-free-waitlist-submitted'));
      await context.close();
    }

    {
      const { context, page } = await freshContext(browser);
      await devLogin(page, 'dev.admin@yawp.local');
      await page.goto(`${baseUrl}/app/admin/free-tier`);
      await page.waitForLoadState('networkidle');
      manifest.shots.push(await shot(page, '03-admin-free-tier-operator'));

      let releaseManifest;
      try {
        releaseManifest = await fetchManifest(page, RELEASE_EMAIL);
      } catch (error) {
        manifest.releaseManifestError = String(error.message || error);
      }
      await context.close();

      if (releaseManifest?.joinUrl) {
        const teacher = await freshContext(browser);
        await teacher.page.goto(releaseManifest.joinUrl);
        await teacher.page.waitForLoadState('networkidle');
        manifest.shots.push(await shot(teacher.page, '04-free-join-release-link'));

        await teacher.page.fill('input[name="password"]', password);
        await teacher.page.fill('input[name="confirmPassword"]', password);
        await teacher.page.locator('button[type="submit"]').click();
        await teacher.page.waitForURL(/\/app\/free-tier\/onboarding/, { timeout: 30_000 });
        manifest.shots.push(await shot(teacher.page, '05-teacher-onboarding-admin-form'));

        await teacher.page.fill('input[name="adminName"]', 'Preview Principal');
        await teacher.page.fill('input[name="adminEmail"]', 'principal@shipreview.invalid');
        await teacher.page.fill('input[name="adminRole"]', 'Principal');
        await teacher.page.locator('button[type="submit"]').click();
        await teacher.page.waitForURL(/\/app\/free-tier\/pending/, { timeout: 30_000 });
        manifest.shots.push(await shot(teacher.page, '06-teacher-pending-approval'));
        await teacher.context.close();

        const admin = await freshContext(browser);
        await devLogin(admin.page, 'dev.admin@yawp.local');
        const approvalLinks = await fetchManifest(admin.page, RELEASE_EMAIL);

        if (approvalLinks.approveUrl) {
          const approveCtx = await freshContext(browser);
          await approveCtx.page.goto(approvalLinks.approveUrl);
          await approveCtx.page.waitForLoadState('networkidle');
          manifest.shots.push(await shot(approveCtx.page, '07-admin-approve-landing'));

          await approveCtx.page.fill('input[name="adminRole"]', 'Principal');
          await approveCtx.page.locator('input[name="authorized"]').check();
          await approveCtx.page.locator('button[type="submit"]').click();
          await approveCtx.page.waitForLoadState('networkidle');
          manifest.shots.push(await shot(approveCtx.page, '08-admin-approve-submitted'));

          await approveCtx.page.locator('button[type="submit"]').click();
          await approveCtx.page.waitForLoadState('networkidle');
          manifest.shots.push(await shot(approveCtx.page, '09-admin-approve-idempotent-resubmit'));
          await approveCtx.context.close();
        }
        await admin.context.close();

        const loginLanding = await freshContext(browser);
        await loginLanding.page.goto(`${baseUrl}/auth/login`);
        await loginLanding.page.waitForLoadState('networkidle');
        manifest.shots.push(await shot(loginLanding.page, '10-post-approval-login-landing'));
        await loginLanding.context.close();

        const setup = await freshContext(browser);
        await passwordLogin(setup.page, RELEASE_EMAIL);
        await setup.page.waitForURL(/\/app\/free-tier\/setup/, { timeout: 30_000 });
        manifest.shots.push(await shot(setup.page, '11-teacher-first-class-setup'));
        await setup.context.close();
      }
    }

    {
      const pending = await freshContext(browser);
      await passwordLogin(pending.page, PENDING_EMAIL);
      await pending.page.waitForURL(/\/app\/free-tier\/pending/, { timeout: 30_000 });
      manifest.shots.push(await shot(pending.page, '12-seed-pending-approval-state'));

      const admin = await freshContext(browser);
      await devLogin(admin.page, 'dev.admin@yawp.local');
      let declineManifest;
      try {
        declineManifest = await fetchManifest(admin.page, PENDING_EMAIL);
      } catch {
        declineManifest = null;
      }
      await admin.context.close();

      if (declineManifest?.declineUrl) {
        const deny = await freshContext(browser);
        await deny.page.goto(declineManifest.declineUrl);
        await deny.page.waitForLoadState('networkidle');
        manifest.shots.push(await shot(deny.page, '13-denial-not-right-person-landing'));
        await deny.context.close();
      }
      await pending.context.close();
    }
  } finally {
    await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await browser.close();
  }

  console.log(`Captured ${manifest.shots.length} screenshots in ${outDir}`);
}

await main();
