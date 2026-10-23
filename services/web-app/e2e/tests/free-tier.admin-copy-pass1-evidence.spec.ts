/**
 * Real admin copy pass1 evidence (frames 01–44 per INDEX.txt; skip E5 45–46).
 * Desktop 1280px, mobile 390px. Requires ADMIN_COPY_PASS1_EVIDENCE_DIR.
 */
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import { mintFreeTierLinkForE2E } from '../helpers/mint-free-tier-link';

const require = createRequire(import.meta.url);
const { encode } = require(
  require.resolve('turbo-stream', { paths: [require.resolve('react-router')] })
);

const OUT = process.env.ADMIN_COPY_PASS1_EVIDENCE_DIR;
const TEACHER = 'Jordan Rivera';
const SCHOOL = 'Lincoln High School';
const TEACHER_EMAIL = 'jrivera@lincolnhs.org';
const ADMIN_EMAIL = 'patel@example.test';
const ADMIN_NAME = 'Dr. Patel';

const evidenceEnabled =
  !!OUT &&
  !!process.env.APPROVAL_V2_BASE_URL &&
  !!process.env.E2E_DATABASE_URL;

const db = createE2EPrismaClient();
const apps: string[] = [];
const users: string[] = [];

function corruptOpaqueToken(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) return token;
  return `${parts[0]}.${parts[1]}.${randomBytes(24).toString('base64url')}`;
}

async function capture(page: import('@playwright/test').Page, id: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(OUT!, `${id}.png`),
    fullPage: true,
  });
}

async function replyPost(
  page: import('@playwright/test').Page,
  result: object,
  button: string,
  expected: RegExp
) {
  const pattern = /\.data(?:\?|$)/;
  await page.route(pattern, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'text/x-script',
      body: await new Response(encode({ data: result })).text(),
    });
  });
  try {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByText(expected).first()).toBeVisible();
    await expect(page.locator('[role="progressbar"] > div')).toHaveCSS(
      'opacity',
      '0'
    );
  } finally {
    await page.unroute(pattern);
  }
}

test.beforeAll(async () => {
  await mkdir(OUT!, { recursive: true });
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
    create: { name: 'feature_flag.free_tier', value: 'true' },
    update: { value: 'true' },
  });
});

test.afterAll(async () => {
  await db.freeTierApplication.deleteMany({ where: { id: { in: apps } } });
  await db.orgMembership.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

async function createSentApplication() {
  const stamp = crypto.randomUUID();
  const user = await db.user.create({
    data: {
      email: `pass1-evidence-${stamp}@example.edu`,
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
      email: `jrivera+${stamp}@lincolnhs.org`,
      name: TEACHER,
      schoolName: SCHOOL,
      location: 'Local',
      gradeLevel: '11',
      status: 'SENT',
    },
  });
  apps.push(app.id);
  return app;
}

async function pendingApproval(applicationId: string) {
  return db.freeTierAdminApproval.create({
    data: {
      applicationId,
      adminName: ADMIN_NAME,
      adminEmail: ADMIN_EMAIL,
      emailCopyVersionHash: 'pass1-evidence',
      firstSentAt: new Date('2026-10-14T15:02:00Z'),
    },
  });
}

for (const width of [1280, 390]) {
  test(`admin copy pass1 evidence at ${width}px`, async ({ page, context }) => {
    test.skip(!evidenceEnabled, 'Set ADMIN_COPY_PASS1_EVIDENCE_DIR');
    test.setTimeout(300_000);

    await page.addInitScript(() => {
      localStorage.removeItem('yawp-dev-panel');
    });

    const octets = crypto.getRandomValues(new Uint8Array(2));
    await context.setExtraHTTPHeaders({
      'x-forwarded-for': `198.18.${octets[0]}.${octets[1]}`,
    });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const suffix = width === 1280 ? 'desktop' : 'mobile';
    const base = process.env.APPROVAL_V2_BASE_URL!;

    // S1 — approve intro
    const app1 = await createSentApplication();
    const approval1 = await pendingApproval(app1.id);
    const approveMint1 = await mintFreeTierLinkForE2E(db, {
      applicationId: app1.id,
      purpose: 'ADMIN_APPROVE',
    });
    const forwardMint1 = await mintFreeTierLinkForE2E(db, {
      applicationId: app1.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval1.id },
      data: { signedLinkId: approveMint1.linkId },
    });
    const approveUrl1 = `${base}/free/admin/approve?t=${encodeURIComponent(approveMint1.token)}`;
    const forwardUrl1 = `${base}/free/admin/not-right-person?t=${encodeURIComponent(forwardMint1.token)}&approveT=${encodeURIComponent(approveMint1.token)}`;

    await page.goto(approveUrl1);
    await expect(
      page.getByRole('heading', {
        name: `Approve Yawp! for ${TEACHER} at ${SCHOOL}`,
      })
    ).toBeVisible();
    await expect(
      page.getByText(`${TEACHER} at ${SCHOOL} would like to use Yawp!`)
    ).toBeVisible();
    await capture(page, `01-s1-approve-intro-${suffix}`);

    // S4 — thank you, teacher email failed
    await page.locator('input[name="adminRole"]').fill('Principal');
    await page.getByRole('checkbox').check();
    await replyPost(
      page,
      { ok: false, reason: 'email_failed' },
      'Approve Yawp!',
      /couldn't email/i
    );
    await capture(page, `03-s4-thank-you-teacher-email-failed-${suffix}`);

    // S5 — paused (budget exceeded)
    const app2 = await createSentApplication();
    const approval2 = await pendingApproval(app2.id);
    const approveMint2 = await mintFreeTierLinkForE2E(db, {
      applicationId: app2.id,
      purpose: 'ADMIN_APPROVE',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval2.id },
      data: { signedLinkId: approveMint2.linkId },
    });
    const approveUrl2 = `${base}/free/admin/approve?t=${encodeURIComponent(approveMint2.token)}`;
    await page.goto(approveUrl2);
    await page.locator('input[name="adminRole"]').fill('Principal');
    await page.getByRole('checkbox').check();
    await replyPost(
      page,
      { ok: false, reason: 'budget_exceeded' },
      'Approve Yawp!',
      /free classrooms are paused/i
    );
    await capture(page, `05-s5-paused-${suffix}`);

    // S9a — expired link with fully valid token (named state)
    const app3 = await createSentApplication();
    const approval3 = await pendingApproval(app3.id);
    const approveMint3 = await mintFreeTierLinkForE2E(db, {
      applicationId: app3.id,
      purpose: 'ADMIN_APPROVE',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval3.id },
      data: { signedLinkId: approveMint3.linkId },
    });
    await db.freeTierSignedLink.update({
      where: { id: approveMint3.linkId },
      data: { expiresAt: new Date(0) },
    });
    await page.goto(
      `${base}/free/admin/approve?t=${encodeURIComponent(approveMint3.token)}`
    );
    await expect(
      page.getByRole('heading', { name: 'This link expired' })
    ).toBeVisible();
    await expect(
      page.getByText(`It was for ${TEACHER} at ${SCHOOL}.`, { exact: false })
    ).toBeVisible();
    await capture(page, `07-s9a-expired-link-named-request-${suffix}`);

    // S9a — bad opaque (generic invalid, no teacher/school names)
    const app3b = await createSentApplication();
    const approval3b = await pendingApproval(app3b.id);
    const approveMint3b = await mintFreeTierLinkForE2E(db, {
      applicationId: app3b.id,
      purpose: 'ADMIN_APPROVE',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval3b.id },
      data: { signedLinkId: approveMint3b.linkId },
    });
    const badToken = corruptOpaqueToken(approveMint3b.token);
    await page.goto(
      `${base}/free/admin/approve?t=${encodeURIComponent(badToken)}`
    );
    await expect(
      page.getByRole('heading', { name: "We couldn't open this link" })
    ).toBeVisible();
    await expect(
      page.getByText(`This link was for ${TEACHER} at ${SCHOOL}.`)
    ).not.toBeVisible();
    await expect(
      page.getByText('Copy it again from the email', { exact: false })
    ).toBeVisible();
    await capture(page, `07b-s9a-bad-opaque-generic-${suffix}`);

    // S9b — unknown request
    await page.goto(`${base}/free/admin/approve?t=not-a-valid-token`);
    await expect(
      page.getByRole('heading', { name: "We couldn't open this link" })
    ).toBeVisible();
    await expect(
      page.getByText('Copy it again from the email', { exact: false })
    ).toBeVisible();
    await capture(page, `09-s9b-couldn-t-open-link-request-unknown-${suffix}`);

    // S10a — link replaced (forwarded)
    const app4 = await createSentApplication();
    const approval4 = await pendingApproval(app4.id);
    const oldMint4 = await mintFreeTierLinkForE2E(db, {
      applicationId: app4.id,
      purpose: 'ADMIN_APPROVE',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval4.id },
      data: { signedLinkId: oldMint4.linkId },
    });
    const oldLinkRow4 = await db.freeTierSignedLink.findUniqueOrThrow({
      where: { id: oldMint4.linkId },
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval4.id },
      data: {
        status: 'REDIRECTED',
        decidedAt: new Date(oldLinkRow4.createdAt.getTime() + 1000),
      },
    });
    const newMint4 = await mintFreeTierLinkForE2E(db, {
      applicationId: app4.id,
      purpose: 'ADMIN_APPROVE',
    });
    await db.freeTierAdminApproval.create({
      data: {
        applicationId: app4.id,
        adminName: 'Sam Chen',
        adminEmail: 'chen@example.test',
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
        status: 'PENDING',
        signedLinkId: newMint4.linkId,
      },
    });
    await page.goto(
      `${base}/free/admin/approve?t=${encodeURIComponent(oldMint4.token)}`
    );
    await expect(
      page.getByRole('heading', { name: 'This link was replaced' })
    ).toBeVisible();
    await expect(page.getByText(/was forwarded to someone else/i)).toBeVisible();
    await capture(page, `11-s10a-link-replaced-forwarded-${suffix}`);

    // S10b — link replaced (resent)
    const app5 = await createSentApplication();
    const approval5 = await pendingApproval(app5.id);
    const oldMint5 = await mintFreeTierLinkForE2E(db, {
      applicationId: app5.id,
      purpose: 'ADMIN_APPROVE',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval5.id },
      data: { signedLinkId: oldMint5.linkId },
    });
    const newMint5 = await mintFreeTierLinkForE2E(db, {
      applicationId: app5.id,
      purpose: 'ADMIN_APPROVE',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval5.id },
      data: { signedLinkId: newMint5.linkId },
    });
    await page.goto(
      `${base}/free/admin/approve?t=${encodeURIComponent(oldMint5.token)}`
    );
    await expect(
      page.getByRole('heading', { name: 'This link was replaced' })
    ).toBeVisible();
    await expect(page.getByText(/A newer link was sent/i)).toBeVisible();
    await capture(page, `13-s10b-link-replaced-resent-${suffix}`);

    // S11 — forward form
    const app6 = await createSentApplication();
    const approval6 = await pendingApproval(app6.id);
    const approveMint6 = await mintFreeTierLinkForE2E(db, {
      applicationId: app6.id,
      purpose: 'ADMIN_APPROVE',
    });
    const forwardMint6 = await mintFreeTierLinkForE2E(db, {
      applicationId: app6.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval6.id },
      data: { signedLinkId: approveMint6.linkId },
    });
    const forwardUrl6 = `${base}/free/admin/not-right-person?t=${encodeURIComponent(forwardMint6.token)}&approveT=${encodeURIComponent(approveMint6.token)}`;
    await page.goto(forwardUrl6);
    await expect(
      page.getByRole('heading', {
        name: `Who should approve Yawp! for ${TEACHER}?`,
      })
    ).toBeVisible();
    await capture(page, `15-s11-forward-form-${suffix}`);

    // S12 — field errors
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.locator('input[name="adminEmail"]').fill('not-an-email');
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Enter a valid email address.'
    );
    await capture(page, `17-s12-forward-form-field-errors-${suffix}`);

    // S13a — same administrator
    await page.locator('input[name="adminName"]').fill(ADMIN_NAME);
    await page.locator('input[name="adminEmail"]').fill(ADMIN_EMAIL);
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('already has this request');
    await capture(page, `19-s13a-forward-alert-same-administrator-${suffix}`);

    // S13b — chain cap
    const app7 = await createSentApplication();
    await db.freeTierApplication.update({
      where: { id: app7.id },
      data: { adminRedirectCount: 3 },
    });
    const approval7 = await pendingApproval(app7.id);
    const approveMint7 = await mintFreeTierLinkForE2E(db, {
      applicationId: app7.id,
      purpose: 'ADMIN_APPROVE',
    });
    const forwardMint7 = await mintFreeTierLinkForE2E(db, {
      applicationId: app7.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval7.id },
      data: { signedLinkId: approveMint7.linkId },
    });
    const forwardUrl7 = `${base}/free/admin/not-right-person?t=${encodeURIComponent(forwardMint7.token)}&approveT=${encodeURIComponent(approveMint7.token)}`;
    await page.goto(forwardUrl7);
    await page.locator('input[name="adminName"]').fill('Next Admin');
    await page.locator('input[name="adminEmail"]').fill('next@example.org');
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('forwarded too many times');
    await capture(page, `21-s13b-forward-alert-chain-cap-${suffix}`);

    // S13c — email failed
    const app8 = await createSentApplication();
    const approval8 = await pendingApproval(app8.id);
    const approveMint8 = await mintFreeTierLinkForE2E(db, {
      applicationId: app8.id,
      purpose: 'ADMIN_APPROVE',
    });
    const forwardMint8 = await mintFreeTierLinkForE2E(db, {
      applicationId: app8.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval8.id },
      data: { signedLinkId: approveMint8.linkId },
    });
    const forwardUrl8 = `${base}/free/admin/not-right-person?t=${encodeURIComponent(forwardMint8.token)}&approveT=${encodeURIComponent(approveMint8.token)}`;
    await page.goto(forwardUrl8);
    await page.locator('input[name="adminName"]').fill('Next Admin');
    await page.locator('input[name="adminEmail"]').fill('next@example.org');
    await replyPost(
      page,
      { ok: false, reason: 'email_failed' },
      'Forward request',
      /couldn't send the request/i
    );
    await capture(page, `23-s13c-forward-alert-email-failed-${suffix}`);

    // S13d — same as teacher
    const app9 = await createSentApplication();
    const approval9 = await pendingApproval(app9.id);
    const approveMint9 = await mintFreeTierLinkForE2E(db, {
      applicationId: app9.id,
      purpose: 'ADMIN_APPROVE',
    });
    const forwardMint9 = await mintFreeTierLinkForE2E(db, {
      applicationId: app9.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval9.id },
      data: { signedLinkId: approveMint9.linkId },
    });
    const forwardUrl9 = `${base}/free/admin/not-right-person?t=${encodeURIComponent(forwardMint9.token)}&approveT=${encodeURIComponent(approveMint9.token)}`;
    await page.goto(forwardUrl9);
    await page.locator('input[name="adminName"]').fill(TEACHER);
    await page.locator('input[name="adminEmail"]').fill(app9.email);
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText("Jordan's own email");
    await capture(page, `25-s13d-forward-alert-same-as-teacher-new-${suffix}`);

    // S14a — unable to forward
    const app10 = await createSentApplication();
    const approval10 = await pendingApproval(app10.id);
    const approveMint10 = await mintFreeTierLinkForE2E(db, {
      applicationId: app10.id,
      purpose: 'ADMIN_APPROVE',
    });
    const forwardMint10 = await mintFreeTierLinkForE2E(db, {
      applicationId: app10.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval10.id },
      data: { signedLinkId: approveMint10.linkId },
    });
    const forwardUrl10 = `${base}/free/admin/not-right-person?t=${encodeURIComponent(forwardMint10.token)}&approveT=${encodeURIComponent(approveMint10.token)}`;
    await page.goto(forwardUrl10);
    await page.locator('input[name="adminName"]').fill('Next Admin');
    await page.locator('input[name="adminEmail"]').fill('next@example.org');
    await replyPost(
      page,
      { ok: false, reason: 'not_found' },
      'Forward request',
      /couldn't forward the request/i
    );
    await capture(page, `27-s14a-unable-to-forward-${suffix}`);

    // S14b — rate limited
    const app11 = await createSentApplication();
    const approval11 = await pendingApproval(app11.id);
    const approveMint11 = await mintFreeTierLinkForE2E(db, {
      applicationId: app11.id,
      purpose: 'ADMIN_APPROVE',
    });
    const forwardMint11 = await mintFreeTierLinkForE2E(db, {
      applicationId: app11.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval11.id },
      data: { signedLinkId: approveMint11.linkId },
    });
    const forwardUrl11 = `${base}/free/admin/not-right-person?t=${encodeURIComponent(forwardMint11.token)}&approveT=${encodeURIComponent(approveMint11.token)}`;
    await page.goto(forwardUrl11);
    await page.locator('input[name="adminName"]').fill('Next Admin');
    await page.locator('input[name="adminEmail"]').fill('next@example.org');
    await replyPost(
      page,
      { ok: false, reason: 'rate_limited' },
      'Forward request',
      /wait a few minutes/i
    );
    await capture(page, `29-s14b-unable-to-forward-rate-limited-${suffix}`);

    // S15a — forwarded success
    const app12 = await createSentApplication();
    const approval12 = await pendingApproval(app12.id);
    const approveMint12 = await mintFreeTierLinkForE2E(db, {
      applicationId: app12.id,
      purpose: 'ADMIN_APPROVE',
    });
    const forwardMint12 = await mintFreeTierLinkForE2E(db, {
      applicationId: app12.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval12.id },
      data: { signedLinkId: approveMint12.linkId },
    });
    const forwardUrl12 = `${base}/free/admin/not-right-person?t=${encodeURIComponent(forwardMint12.token)}&approveT=${encodeURIComponent(approveMint12.token)}`;
    await page.goto(forwardUrl12);
    await page.locator('input[name="adminName"]').fill('Next Admin');
    await page.locator('input[name="adminEmail"]').fill('nextadmin@example.org');
    await replyPost(
      page,
      {
        ok: true,
        teacherName: TEACHER,
        schoolName: SCHOOL,
        recipientName: 'Next Admin',
        recipientEmail: 'nextadmin@example.org',
        manualReview: false,
      },
      'Forward request',
      /We sent the request/
    );
    await capture(page, `31-s15a-forwarded-${suffix}`);

    // S15b — manual review variant
    const app13 = await createSentApplication();
    await db.freeTierApplication.update({
      where: { id: app13.id },
      data: { status: 'MANUAL_REVIEW' },
    });
    const approval13 = await pendingApproval(app13.id);
    const approveMint13 = await mintFreeTierLinkForE2E(db, {
      applicationId: app13.id,
      purpose: 'ADMIN_APPROVE',
    });
    const forwardMint13 = await mintFreeTierLinkForE2E(db, {
      applicationId: app13.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval13.id },
      data: { signedLinkId: approveMint13.linkId },
    });
    const forwardUrl13 = `${base}/free/admin/not-right-person?t=${encodeURIComponent(forwardMint13.token)}&approveT=${encodeURIComponent(approveMint13.token)}`;
    await page.goto(forwardUrl13);
    await page.locator('input[name="adminName"]').fill('Next Admin');
    await page.locator('input[name="adminEmail"]').fill('nextadmin@example.org');
    await replyPost(
      page,
      {
        ok: true,
        teacherName: TEACHER,
        schoolName: SCHOOL,
        recipientName: 'Next Admin',
        recipientEmail: 'nextadmin@example.org',
        manualReview: true,
      },
      'Forward request',
      /We'll send the request/
    );
    await capture(page, `33-s15b-forwarded-manual-review-${suffix}`);
  });
}
