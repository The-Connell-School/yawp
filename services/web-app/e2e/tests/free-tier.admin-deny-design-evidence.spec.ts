/**
 * Design evidence for admin deny + Q&A (deny-v1 / deny-v2 frames).
 * Set ADMIN_DENY_DESIGN_EVIDENCE_DIR and run playwright.admin-deny-design-evidence.config.ts
 */
import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCookieSessionStorage } from 'react-router';
import { createE2EPrismaClient } from '../prisma-client';
import { mintFreeTierLinkForE2E } from '../helpers/mint-free-tier-link';
import { provisionFreeClassroomForE2E } from '../helpers/provision-free-classroom-for-e2e';

const OUT =
  process.env.ADMIN_DENY_DESIGN_EVIDENCE_DIR ??
  '/opt/cursor/artifacts/admin-deny-evidence';
const TEACHER = 'Jordan Rivera';
const SCHOOL = 'Lincoln High School';
const ADMIN = 'Dr. Patel';
const evidenceEnabled =
  !!process.env.APPROVAL_V2_BASE_URL &&
  !!process.env.E2E_DATABASE_URL &&
  !!process.env.SESSION_SECRET;

const db = createE2EPrismaClient();
const apps: string[] = [];
const users: string[] = [];
const webAppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function renderTeacherDeniedEmailHtml(
  args: Record<string, unknown>
): { html: string; subject: string } {
  const runner = path.join(webAppRoot, 'e2e/helpers/render-teacher-denied-email-runner.ts');
  const result = spawnSync('bun', [runner, JSON.stringify(args)], {
    cwd: webAppRoot,
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      ['renderTeacherDeniedEmailHtml failed', result.stderr, result.stdout]
        .filter(Boolean)
        .join('\n')
    );
  }
  return JSON.parse(result.stdout) as { html: string; subject: string };
}

function viewportSuffix(width: number) {
  return width === 390 ? 'mobile' : 'desktop';
}

async function capture(page: import('@playwright/test').Page, id: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(OUT, `${id}.png`),
    fullPage: true,
  });
}

async function setYawpE2eStub(
  page: import('@playwright/test').Page,
  stub: string | null
) {
  const base = process.env.APPROVAL_V2_BASE_URL!;
  await page.context().addCookies([
    { name: 'yawp_e2e_stub', value: stub ?? 'clear', url: base },
  ]);
}

async function loginTeacher(page: import('@playwright/test').Page, userId: string) {
  const session = await db.session.create({
    data: { userId, expirationDate: new Date(Date.now() + 3600000) },
  });
  const storage = createCookieSessionStorage({
    cookie: {
      name: 'en_session',
      secrets: process.env.SESSION_SECRET!.split(','),
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    },
  });
  const cookie = await storage.getSession();
  cookie.set('sessionId', session.id);
  await page.context().addCookies([
    {
      name: 'en_session',
      value: (await storage.commitSession(cookie))
        .split(';')[0]
        .slice('en_session='.length),
      url: process.env.APPROVAL_V2_BASE_URL!,
    },
  ]);
}

async function seedPendingApproval() {
  const user = await db.user.create({
    data: {
      email: `deny-evidence-${crypto.randomUUID()}@example.edu`,
      name: TEACHER,
      memberships: {
        create: { organizationId: 'default-org', role: 'TEACHER' },
      },
    },
  });
  users.push(user.id);
  const app = await db.freeTierApplication.create({
    data: {
      userId: user.id,
      email: user.email!,
      name: TEACHER,
      schoolName: SCHOOL,
      location: 'Local',
      gradeLevel: '11',
      status: 'ACCOUNT_CREATED',
      organizationId: 'default-org',
    },
  });
  apps.push(app.id);
  provisionFreeClassroomForE2E(app.id);
  await db.freeTierApplication.update({
    where: { id: app.id },
    data: { status: 'SENT' },
  });
  const approval = await db.freeTierAdminApproval.create({
    data: {
      applicationId: app.id,
      adminName: ADMIN,
      adminEmail: 'patel@lincolnusd.org',
      emailCopyVersionHash: 'design-evidence',
      firstSentAt: new Date('2026-10-22T12:00:00Z'),
    },
  });
  const mint = await mintFreeTierLinkForE2E(db, {
    applicationId: app.id,
    purpose: 'ADMIN_APPROVE',
  });
  await db.freeTierAdminApproval.update({
    where: { id: approval.id },
    data: { signedLinkId: mint.linkId },
  });
  return { app, approval, mint, user };
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
  await db.organization.upsert({
    where: { id: 'default-org' },
    create: {
      id: 'default-org',
      name: 'Local placeholder',
      plan: 'FREE_CLASSROOM',
    },
    update: { plan: 'FREE_CLASSROOM' },
  });
  await db.setting.upsert({
    where: { name: 'feature_flag.free_tier' },
    create: {
      name: 'feature_flag.free_tier',
      value: JSON.stringify({ mode: 'everyone', orgIds: [] }),
    },
    update: { value: JSON.stringify({ mode: 'everyone', orgIds: [] }) },
  });
  await db.setting.upsert({
    where: { name: 'feature_flag.demo-feedback-widget' },
    create: { name: 'feature_flag.demo-feedback-widget', value: 'false' },
    update: { value: 'false' },
  });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('yawp-dev-panel');
  });
});

test.afterAll(async () => {
  await db.freeTierApplication.deleteMany({ where: { id: { in: apps } } });
  await db.orgMembership.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

for (const width of [1440, 390]) {
  test(`admin deny and Q&A design evidence at ${width}px`, async ({ page }) => {
    test.skip(!evidenceEnabled, 'Set APPROVAL_V2_BASE_URL, E2E_DATABASE_URL, SESSION_SECRET');
    test.setTimeout(360_000);
    const octets = crypto.getRandomValues(new Uint8Array(2));
    await page.context().setExtraHTTPHeaders({
      'x-forwarded-for': `198.18.${octets[0]}.${octets[1]}`,
    });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const base = process.env.APPROVAL_V2_BASE_URL!;
    const suffix = viewportSuffix(width);

    const approveSeed = await seedPendingApproval();
    const approveUrl = `${base}/free/admin/approve?t=${encodeURIComponent(approveSeed.mint.token)}`;

    await page.goto(approveUrl, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('admin-approval-qa')).toBeVisible();
    await expect(page.getByRole('link', { name: /learn more first/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forward this request' })).toBeVisible();
    await capture(page, `01_deny-request-button-states_${suffix}`);
    await capture(page, `02_approve-page-with-deny-qanda-placeholder_${suffix}`);
    await capture(page, `deny-v2_approve_qa_a_all_closed_${suffix}`);

    await page.getByRole('button', { name: 'What Yawp! is' }).click();
    await expect(
      page.getByRole('button', { name: 'What Yawp! is' })
    ).toHaveAttribute('aria-expanded', 'true');
    await capture(page, `deny-v2_approve_qa_b_one_question_open_${suffix}`);

    await page.goto(approveUrl, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Questions about student privacy?' }).click();
    await capture(page, `deny-v2_approve_qa_c_privacy_group_open_${suffix}`);

    const denyUiSeed = await seedPendingApproval();
    const denyUiUrl = `${base}/free/admin/approve/deny?t=${encodeURIComponent(denyUiSeed.mint.token)}`;
    await page.goto(denyUiUrl, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Deny this request?' })
    ).toBeVisible();
    await capture(page, `04_deny-confirm_${suffix}`);

    const denyErrorSeed = await seedPendingApproval();
    const denyErrorUrl = `${base}/free/admin/approve/deny?t=${encodeURIComponent(denyErrorSeed.mint.token)}`;
    await setYawpE2eStub(page, 'deny-unavailable');
    await page.goto(denyErrorUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#denyReason').fill('Private note for Yawp! team only');
    await page.getByRole('button', { name: 'Deny request', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText("We couldn't save your answer");
    await capture(page, `08_deny-confirm_error_${suffix}`);
    await setYawpE2eStub(page, null);

    const denyLoadingSeed = await seedPendingApproval();
    const denyLoadingUrl = `${base}/free/admin/approve/deny?t=${encodeURIComponent(denyLoadingSeed.mint.token)}`;
    await setYawpE2eStub(page, 'deny-delay');
    await page.goto(denyLoadingUrl, { waitUntil: 'domcontentloaded' });
    const denySubmit = page.getByRole('button', { name: 'Deny request', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Denying…' })).toBeVisible();
    await capture(page, `06_deny-confirm_loading_${suffix}`);
    await denySubmit;
    await expect(
      page.getByRole('heading', { name: 'Thanks for letting us know' })
    ).toBeVisible();
    await setYawpE2eStub(page, null);

    const denyDoneSeed = await seedPendingApproval();
    const denyDoneApproveUrl = `${base}/free/admin/approve?t=${encodeURIComponent(denyDoneSeed.mint.token)}`;
    const denyDoneDenyUrl = `${base}/free/admin/approve/deny?t=${encodeURIComponent(denyDoneSeed.mint.token)}`;
    await page.goto(denyDoneDenyUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Deny request', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Thanks for letting us know' })
    ).toBeVisible();
    await capture(page, `10_after-deny-admin_${suffix}`);

    await page.goto(denyDoneApproveUrl, { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('heading', { name: "You've already answered this request." })
    ).toBeVisible();
    await capture(page, `12_link-opened-again-already-decided_${suffix}`);

    await loginTeacher(page, denyDoneSeed.user.id);
    await page.goto(`${base}/app/free-tier/pending`, { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('heading', { name: "Your request wasn't approved" })
    ).toBeVisible();
    await capture(page, `14_teacher-denied-status-page_${suffix}`);

    await page.getByRole('button', { name: 'Ask another administrator' }).click();
    await expect(page.getByTestId('teacher-ask-another-form')).toBeVisible();
    await capture(page, `16_teacher-ask-another-administrator-empty_${suffix}`);

    await page.getByLabel('Administrator email').fill('not-an-email');
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Enter their name');
    await capture(page, `18_teacher-form-errors_${suffix}`);

    await setYawpE2eStub(page, 'forward-unavailable');
    await page.getByLabel('Administrator name').fill('Sam Chen');
    await page.getByLabel('Administrator email').fill('sam@lincolnusd.org');
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('could not forward');
    await capture(page, `20_teacher-send-failed_${suffix}`);
    await setYawpE2eStub(page, null);

    await db.freeTierApplication.update({
      where: { id: denyDoneSeed.app.id },
      data: { adminRedirectCount: 3 },
    });
    await page.goto(`${base}/app/free-tier/pending`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('link', { name: 'Email support' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask another administrator' })).toHaveCount(0);
    await capture(page, `22_teacher-all-3-requests-used_${suffix}`);

    const email = renderTeacherDeniedEmailHtml({
      teacherName: TEACHER,
      adminName: ADMIN,
      schoolName: SCHOOL,
      statusUrl: `${base}/app/free-tier/pending?ask=1`,
      chainCapReached: false,
    });
    await page.setContent(email.html, { waitUntil: 'networkidle' });
    await capture(page, `24_teacher-deny-email_${suffix}`);

    const emailCap = renderTeacherDeniedEmailHtml({
      teacherName: TEACHER,
      adminName: ADMIN,
      schoolName: SCHOOL,
      statusUrl: `${base}/app/free-tier/pending`,
      chainCapReached: true,
    });
    await page.setContent(emailCap.html, { waitUntil: 'networkidle' });
    await capture(page, `25_teacher-deny-email_cap_${suffix}`);

    await writeFile(
      path.join(OUT, `evidence-manifest-${suffix}.json`),
      JSON.stringify({ width, capturedAt: new Date().toISOString() }, null, 2)
    );
  });
}
