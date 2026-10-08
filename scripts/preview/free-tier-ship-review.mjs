/**
 * Headless Playwright capture for Free Tier C ship review on a PR preview.
 * Uses emailed link URLs from FreeTierEmailLog via the preview QA manifest only.
 */
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { loginCookieHeader } from './smoke-login.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = (process.env.PREVIEW_BASE_URL || '').replace(/\/$/, '');
const accessCode = process.env.PREVIEW_ACCESS_CODE || '';
const outDir = path.resolve(process.env.SHIP_REVIEW_OUT_DIR || 'ship-review-screenshots');
const password = process.env.SHIP_REVIEW_TEACHER_PASSWORD || 'yawp-dev';
const RELEASE_EMAIL = 'shipreview-released@yawp.invalid';
const PAID_TEACHER_EMAIL = 'dev.teacher@yawp.local';

if (!baseUrl || !accessCode) {
  console.error('PREVIEW_BASE_URL and PREVIEW_ACCESS_CODE are required');
  process.exit(1);
}

async function enterPreview(page) {
  const wakeUrl = new URL(baseUrl);
  wakeUrl.searchParams.set('code', accessCode);
  await page.goto(wakeUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  if (page.url().includes('/auth/preview-access')) {
    await page.fill('input[name="code"]', accessCode);
    await page.locator('form[method="post"]').first().evaluate((form) => form.requestSubmit());
    await page.waitForURL((url) => !url.pathname.includes('/auth/preview-access'), {
      timeout: 120_000,
    });
  }
}

async function devLogin(page, email) {
  await passwordLogin(page, email, '/app');
}

async function passwordLogin(page, email, redirectTo = '/app') {
  const cookieHeader = await loginCookieHeader({
    baseUrl,
    accessCode,
    email,
    password,
    redirectTo,
  });
  const host = new URL(baseUrl).hostname;
  const secure = baseUrl.startsWith('https:');
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    const name = eq === -1 ? trimmed : trimmed.slice(0, eq);
    const value = eq === -1 ? '' : trimmed.slice(eq + 1);
    await page.context().addCookies([
      { name, value, domain: host, path: '/', secure, sameSite: 'Lax' },
    ]);
  }
  await page.goto(`${baseUrl}${redirectTo}`, { waitUntil: 'networkidle' });
}

async function waitForPostApprovalApp(page, email) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await passwordLogin(page, email, '/app/my-classes');
    const url = page.url();
    if (/\/app\/my-classes/.test(url)) return url;
    if (/\/app\/free-tier\/pending/.test(url)) {
      await page.waitForTimeout(4000);
      continue;
    }
    await page.waitForTimeout(2500);
  }
  throw new Error(`Post-approval did not reach my-classes (last URL: ${page.url()})`);
}

async function shot(page, name, manifest, options = {}) {
  const suffix = options.mobile ? '-mobile' : '';
  const file = path.join(outDir, `${name}${suffix}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const bytes = await readFile(file);
  const md5 = createHash('md5').update(bytes).digest('hex');
  manifest.shots.push({ file: `${name}${suffix}.png`, md5 });
  return file;
}

async function withMobileViewport(page, fn) {
  await page.setViewportSize({ width: 390, height: 844 });
  await fn();
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function pollJoinManifest(page, email, attempts = 80) {
  const normalized = email.trim().toLowerCase();
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const manifest = await fetchManifest(page, normalized);
      if (manifest.joinUrl) return manifest;
    } catch (error) {
      const message = String(error.message || error);
      if (!message.includes('404') && !message.includes('application_not_found')) {
        throw error;
      }
    }
    await page.waitForTimeout(1500);
  }
  throw new Error(`joinUrl not in manifest for ${normalized}`);
}

async function releaseWaitlistEmail(page, email) {
  const normalized = email.trim().toLowerCase();
  await page.goto(`${baseUrl}/app/admin/free-tier?view=waitlist`, { waitUntil: 'networkidle' });
  const row = page.locator('tr').filter({ hasText: normalized });
  const checkbox = row.locator('input[type="checkbox"]');
  if (await checkbox.count() === 0) {
    throw new Error(`No waitlist row for ${normalized}`);
  }
  await checkbox.check();
  await page.getByRole('button', { name: /Release selected/i }).click();
  await page.waitForTimeout(3000);
  return await pollJoinManifest(page, normalized);
}

async function fetchManifest(page, email) {
  const result = await page.evaluate(async (em) => {
    const res = await fetch(
      `/api/preview/qa/free-tier-manifest?email=${encodeURIComponent(em)}`,
      { credentials: 'include' }
    );
    const body = await res.text();
    return { status: res.status, body };
  }, email);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`manifest ${result.status}: ${result.body.slice(0, 200)}`);
  }
  return JSON.parse(result.body);
}

async function freshContext(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await enterPreview(page);
  return { context, page };
}

async function createBypassToken(adminPage) {
  await adminPage.getByRole('button', { name: 'Create token' }).waitFor({ timeout: 60_000 });
  await adminPage.fill('input[name="label"]', 'ship-review-self');
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
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/free') && res.request().method() === 'POST',
      { timeout: 30_000 }
    ),
    page.getByRole('button', { name: /Continue/i }).click(),
  ]);
  await page.getByText(/on the list|Continue/i).first().waitFor({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const manifest = { capturedAt: new Date().toISOString(), baseUrl, shots: [] };
  const teacherFlowEmail = `shipreview.flow.${Date.now()}@shipreview-high.edu`;

  try {
    {
      const { context, page } = await freshContext(browser);
      await page.goto(`${baseUrl}/free`);
      await shot(page, '01-free-waitlist', manifest);
      await withMobileViewport(page, async () => {
        await shot(page, '01-free-waitlist', manifest, { mobile: true });
      });
      await page.fill('input[name="name"]', 'Ship Review Waitlist');
      await page.fill('input[name="email"]', `shipreview-waitlist+${Date.now()}@shipreview-high.edu`);
      await page.fill('input[name="schoolName"]', 'Ship Review High');
      await page.fill('input[name="location"]', 'Preview');
      await page.fill('input[name="gradeLevel"]', '9');
      await page.getByRole('button', { name: /Join the waitlist/i }).click();
      await page.getByRole('status').getByText(/on the list/i).waitFor({ timeout: 20_000 });
      await shot(page, '01-free-waitlist-submitted', manifest);
      await withMobileViewport(page, async () => {
        await shot(page, '01-free-waitlist-submitted', manifest, { mobile: true });
      });
      await context.close();
    }

    let releaseManifest;
    let teacherFlowEmailResolved = teacherFlowEmail;
    {
      const { context, page } = await freshContext(browser);
      await devLogin(page, 'dev.admin@yawp.local');
      await page.goto(`${baseUrl}/app/admin/free-tier`);
      await page.waitForLoadState('networkidle');
      await shot(page, '02-operator-free-tier-admin', manifest);

      releaseManifest = await fetchManifest(page, RELEASE_EMAIL).catch(() => null);
      if (!releaseManifest?.joinUrl) {
        await page.goto(`${baseUrl}/app/admin/free-tier?view=waitlist`, { waitUntil: 'networkidle' });
        const releaseRow = page.locator('tr').filter({ hasText: RELEASE_EMAIL });
        const hasWaitlistRow = await releaseRow.locator('input[type="checkbox"]').count();
        if (hasWaitlistRow > 0) {
          await releaseRow.locator('input[type="checkbox"]').check();
          await page.getByRole('button', { name: /Release selected/i }).click();
          await page.waitForTimeout(3000);
          teacherFlowEmailResolved = RELEASE_EMAIL;
          releaseManifest = await releaseWaitlistEmail(page, RELEASE_EMAIL);
        } else {
          const acqToken = await createBypassToken(page);
          teacherFlowEmailResolved = teacherFlowEmail;
          const redeem = await freshContext(browser);
          await redeemBypassToken(redeem.page, acqToken, teacherFlowEmailResolved);
          releaseManifest = await pollJoinManifest(page, teacherFlowEmailResolved, 40).catch(() => null);
          if (!releaseManifest?.joinUrl) {
            const joinPath = redeem.page.url();
            if (/\/free\/join/.test(joinPath)) {
              releaseManifest = { joinUrl: joinPath };
            } else {
              await redeem.context.close();
              throw new Error(
                `No joinUrl for ${teacherFlowEmailResolved} (last URL: ${joinPath})`
              );
            }
          }
          await redeem.context.close();
        }
      } else {
        teacherFlowEmailResolved = RELEASE_EMAIL;
      }
      await context.close();
    }

    if (!releaseManifest?.joinUrl) {
      throw new Error('release joinUrl missing from emailed manifest');
    }

    {
      const teacher = await freshContext(browser);
      await teacher.page.goto(releaseManifest.joinUrl);
      await teacher.page.waitForLoadState('networkidle');
      await shot(teacher.page, '03-free-join-before-account', manifest);

      await teacher.page.fill('input[name="name"]', 'Ship Review Flow');
      await teacher.page.fill('input[name="password"]', password);
      await teacher.page.fill('input[name="confirmPassword"]', password);
      await teacher.page.locator('form').evaluate((form) => form.submit());
      await teacher.page.waitForTimeout(1500);
      await passwordLogin(teacher.page, teacherFlowEmailResolved, '/app/free-tier/onboarding');
      await teacher.page.waitForURL(/\/app\/free-tier\/onboarding/, { timeout: 45_000 });
      await shot(teacher.page, '04-teacher-onboarding-form', manifest);

      await teacher.page.fill('input[name="adminName"]', 'Preview Principal');
      await teacher.page.fill('input[name="adminEmail"]', 'principal@shipreview-high.edu');
      await teacher.page.fill('input[name="adminRole"]', 'Principal');
      await Promise.all([
        teacher.page.waitForURL(/\/app\/free-tier\/pending/, { timeout: 45_000 }),
        teacher.page.locator('button[type="submit"]').click(),
      ]);
      await shot(teacher.page, '05-teacher-pending-approval', manifest);

      const admin = await freshContext(browser);
      await devLogin(admin.page, 'dev.admin@yawp.local');
      const approvalLinks = await fetchManifest(admin.page, teacherFlowEmailResolved);

      if (approvalLinks.declineUrl) {
        const redirectCtx = await freshContext(browser);
        await redirectCtx.page.goto(approvalLinks.declineUrl);
        await redirectCtx.page.waitForLoadState('networkidle');
        await shot(redirectCtx.page, '06-not-right-person-form', manifest);
        await redirectCtx.page.fill('input[name="adminName"]', 'District Admin');
        await redirectCtx.page.fill('input[name="adminEmail"]', 'district@shipreview-high.edu');
        await Promise.all([
          redirectCtx.page.waitForLoadState('networkidle'),
          redirectCtx.page.locator('button[type="submit"]').click(),
        ]);
        await shot(redirectCtx.page, '07-not-right-person-submitted', manifest);
        await redirectCtx.context.close();
      }

      if (approvalLinks.approveUrl) {
        const approveCtx = await freshContext(browser);
        await approveCtx.page.goto(approvalLinks.approveUrl);
        await approveCtx.page.waitForLoadState('networkidle');
        await shot(approveCtx.page, '08-admin-approve-landing', manifest);

        await approveCtx.page.fill('input[name="adminRole"]', 'Principal');
        await approveCtx.page.locator('input[name="authorized"]').check();
        await Promise.all([
          approveCtx.page.waitForResponse(
            (res) =>
              res.url().includes('/free/admin/approve') && res.request().method() === 'POST',
            { timeout: 45_000 }
          ),
          approveCtx.page.locator('button[type="submit"]').click(),
        ]);
        await approveCtx.page.waitForLoadState('networkidle');
        await shot(approveCtx.page, '09-admin-approve-success', manifest);

        await approveCtx.page.goto(approvalLinks.approveUrl);
        await approveCtx.page.waitForLoadState('networkidle');
        await shot(approveCtx.page, '10-admin-already-approved', manifest);
        await approveCtx.context.close();
      }
      await admin.context.close();
      await teacher.context.close();
    }

    {
      const classes = await freshContext(browser);
      await waitForPostApprovalApp(classes.page, teacherFlowEmailResolved);
      await shot(classes.page, '11-teacher-class-created', manifest);
      await classes.page.goto(`${baseUrl}/app/assignments`);
      await classes.page.waitForLoadState('networkidle');
      await shot(classes.page, '12-teacher-ai-unlocked-assignments', manifest);
      await classes.context.close();
    }

    {
      const admin = await freshContext(browser);
      await devLogin(admin.page, 'dev.admin@yawp.local');
      await admin.page.goto(`${baseUrl}/app/admin/free-tier`);
      const acqToken = await createBypassToken(admin.page);
      const selfEmail = `shipreview-self+${Date.now()}@shipreview-high.edu`;
      const self = await freshContext(browser);
      await redeemBypassToken(self.page, acqToken, selfEmail);
      const releaseMint = await fetchManifest(admin.page, selfEmail).catch(() => null);
      if (releaseMint?.joinUrl) {
        await self.page.goto(releaseMint.joinUrl);
        await self.page.fill('input[name="name"]', 'Self Review');
        await self.page.fill('input[name="password"]', password);
        await self.page.fill('input[name="confirmPassword"]', password);
        await self.page.locator('form').evaluate((form) => form.submit());
        await passwordLogin(self.page, selfEmail, '/app/free-tier/onboarding');
      } else {
        await passwordLogin(self.page, selfEmail, '/app/free-tier/onboarding');
      }
      await self.page.fill('input[name="adminName"]', 'Alias');
      const [local, domain] = selfEmail.split('@');
      await self.page.fill('input[name="adminEmail"]', `${local}+alias@${domain}`);
      await self.page.fill('input[name="adminRole"]', 'Principal');
      await self.page.locator('button[type="submit"]').click();
      await self.page.waitForURL(/\/app\/free-tier\/pending/, { timeout: 45_000 });
      await shot(self.page, '13-self-approval-manual-review', manifest);
      await self.context.close();
      await admin.context.close();
    }

    {
      const paid = await freshContext(browser);
      await devLogin(paid.page, PAID_TEACHER_EMAIL);
      await paid.page.goto(`${baseUrl}/app/my-classes`);
      await paid.page.waitForLoadState('networkidle');
      await shot(paid.page, '14-paid-school-teacher-unchanged', manifest);
      await paid.context.close();
    }

    const md5s = manifest.shots.map((s) => s.md5);
    const dupes = md5s.filter((h, i) => md5s.indexOf(h) !== i);
    if (dupes.length) {
      throw new Error(`Duplicate screenshot md5: ${[...new Set(dupes)].join(', ')}`);
    }
    if (manifest.shots.length < 14) {
      throw new Error(`Expected at least 14 screenshots, got ${manifest.shots.length}`);
    }
  } finally {
    await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await browser.close();
  }

  console.log(`Captured ${manifest.shots.length} screenshots in ${outDir}`);
}

await main();
