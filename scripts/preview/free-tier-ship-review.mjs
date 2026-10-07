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
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/auth/preview-access')) {
    await page.fill('input[name="code"]', accessCode);
    await page.locator('form[method="post"]').first().evaluate((form) => form.requestSubmit());
    await page.waitForURL((url) => !url.pathname.includes('/auth/preview-access'), {
      timeout: 20_000,
    });
  }
}

async function devLogin(page, email) {
  const status = await page.evaluate(async (loginEmail) => {
    const response = await fetch('/auth/dev-login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: loginEmail, redirectTo: '/app' }),
      credentials: 'same-origin',
    });
    return response.status;
  }, email);
  if (status >= 400) {
    throw new Error(`dev login failed for ${email}: HTTP ${status}`);
  }
  await page.goto(`${baseUrl}/app`, { waitUntil: 'networkidle' });
}

async function passwordLogin(page, email, redirectTo = '/app') {
  await page.goto(
    `${baseUrl}/auth/login?redirectTo=${encodeURIComponent(redirectTo)}`,
    { waitUntil: 'networkidle' }
  );
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.locator('form').evaluate((form) => form.submit());
  await page.waitForURL(
    (url) => url.pathname === redirectTo || url.pathname.startsWith(`${redirectTo}/`),
    { timeout: 45_000 }
  );
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

async function createBypassToken(adminPage) {
  await adminPage.fill('input[name="label"]', 'ship-review-qa');
  await adminPage.locator('input[name="bypass"]').check();
  const [response] = await Promise.all([
    adminPage.waitForResponse(
      (res) =>
        res.url().includes('/app/admin/free-tier') && res.request().method() === 'POST',
      { timeout: 20_000 }
    ),
    adminPage.getByRole('button', { name: 'Create token' }).click(),
  ]);
  const body = await response.text();
  const match = body.match(/"token","([^"]+)"/);
  if (!match?.[1]) throw new Error('Could not parse acquisition token from admin response');
  return match[1];
}

async function redeemBypassToken(page, acqToken, teacherEmail) {
  await page.goto(`${baseUrl}/free?t=${encodeURIComponent(acqToken)}`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[name="name"]', 'Ship Review Flow');
  await page.fill('input[name="email"]', teacherEmail);
  await page.fill('input[name="schoolName"]', 'Ship Review High');
  await page.fill('input[name="location"]', 'Preview');
  await page.fill('input[name="gradeLevel"]', '11');
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.waitForTimeout(2000);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const manifest = { capturedAt: new Date().toISOString(), baseUrl, shots: [] };
  let teacherFlowEmail = RELEASE_EMAIL;

  try {
    {
      const { context, page } = await freshContext(browser);
      await page.goto(`${baseUrl}/free`);
      manifest.shots.push(await shot(page, '01-free-waitlist'));
      await page.fill('input[name="name"]', 'Ship Review Waitlist');
      await page.fill(
        'input[name="email"]',
        `shipreview-waitlist+${Date.now()}@shipreview-high.edu`
      );
      await page.fill('input[name="schoolName"]', 'Ship Review High');
      await page.fill('input[name="location"]', 'Preview');
      await page.fill('input[name="gradeLevel"]', '9');
      await page.getByRole('button', { name: /Join the waitlist/i }).click();
      await page.getByRole('status').getByText(/on the list/i).waitFor({ timeout: 20_000 });
      manifest.shots.push(await shot(page, '02-free-waitlist-submitted'));
      await context.close();
    }

    let releaseManifest;
    {
      const { context, page } = await freshContext(browser);
      await devLogin(page, 'dev.admin@yawp.local');
      await page.goto(`${baseUrl}/app/admin/free-tier`);
      await page.waitForLoadState('networkidle');
      manifest.shots.push(await shot(page, '03-admin-free-tier-operator'));

      try {
        releaseManifest = await fetchManifest(page, RELEASE_EMAIL);
      } catch (error) {
        manifest.releaseManifestError = String(error.message || error);
        const acqToken = await createBypassToken(page);
        teacherFlowEmail = `shipreview-flow+${Date.now()}@shipreview-high.edu`;
        const redeem = await freshContext(browser);
        await redeemBypassToken(redeem.page, acqToken, teacherFlowEmail);
        manifest.shots.push(await shot(redeem.page, '03b-free-token-redeem'));
        await redeem.context.close();
        releaseManifest = await fetchManifest(page, teacherFlowEmail);
        manifest.teacherFlowEmail = teacherFlowEmail;
      }
      await context.close();
    }

    if (releaseManifest?.joinUrl) {
      const teacher = await freshContext(browser);
      await teacher.page.goto(releaseManifest.joinUrl);
      await teacher.page.waitForLoadState('networkidle');
      manifest.shots.push(await shot(teacher.page, '04-free-join-release-link'));

      await teacher.page.fill('input[name="name"]', 'Ship Review Flow');
      await teacher.page.fill('input[name="password"]', password);
      await teacher.page.fill('input[name="confirmPassword"]', password);
      await teacher.page.locator('form').evaluate((form) => form.submit());
      await teacher.page.waitForTimeout(1500);
      await passwordLogin(teacher.page, teacherFlowEmail, '/app/free-tier/onboarding');
      await teacher.page.waitForURL(/\/app\/free-tier\/onboarding/, { timeout: 45_000 });
      manifest.shots.push(await shot(teacher.page, '05-teacher-onboarding-admin-form'));

      await teacher.page.fill('input[name="adminName"]', 'Preview Principal');
      await teacher.page.fill('input[name="adminEmail"]', 'principal@shipreview-high.edu');
      await teacher.page.fill('input[name="adminRole"]', 'Principal');
      await Promise.all([
        teacher.page.waitForURL(/\/app\/free-tier\/pending/, { timeout: 45_000 }),
        teacher.page.locator('button[type="submit"]').click(),
      ]);
      manifest.shots.push(await shot(teacher.page, '06-teacher-pending-approval'));

      const admin = await freshContext(browser);
      await devLogin(admin.page, 'dev.admin@yawp.local');
      const approvalLinks = await fetchManifest(admin.page, teacherFlowEmail);

      if (approvalLinks.declineUrl) {
        const deny = await freshContext(browser);
        await deny.page.goto(approvalLinks.declineUrl);
        await deny.page.waitForLoadState('networkidle');
        manifest.shots.push(await shot(deny.page, '13-denial-not-right-person-landing'));
        await deny.context.close();
      }

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
      await teacher.context.close();

      const loginLanding = await freshContext(browser);
      await loginLanding.page.goto(`${baseUrl}/auth/login`);
      await loginLanding.page.waitForLoadState('networkidle');
      manifest.shots.push(await shot(loginLanding.page, '10-post-approval-login-landing'));
      await loginLanding.context.close();

      const setup = await freshContext(browser);
      await passwordLogin(setup.page, teacherFlowEmail, '/app/free-tier/setup');
      await setup.page.waitForURL(/\/app\/free-tier\/setup/, { timeout: 30_000 });
      manifest.shots.push(await shot(setup.page, '11-teacher-first-class-setup'));
      await setup.context.close();
    }

    try {
      const pending = await freshContext(browser);
      await passwordLogin(pending.page, PENDING_EMAIL, '/app/free-tier/pending');
      await pending.page.waitForURL(/\/app\/free-tier\/pending/, { timeout: 15_000 });
      manifest.shots.push(await shot(pending.page, '12-seed-pending-approval-state'));
      await pending.context.close();
    } catch {
      manifest.seedPendingSkipped = true;
    }
  } finally {
    await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await browser.close();
  }

  console.log(`Captured ${manifest.shots.length} screenshots in ${outDir}`);
}

await main();
