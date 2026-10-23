/**
 * REAL admin copy pass1 evidence for PR 673.
 * Captures ALL frames 01-44 from /tmp/pass1/INDEX.txt (skip 45-46 E5).
 * Desktop: 1280px, Mobile: 390px
 */
import React from 'react';
import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createE2EPrismaClient } from '../prisma-client';
import { mintFreeTierLinkForE2E } from '../helpers/mint-free-tier-link';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildDesignedAdminApprovalEmail } from '../../app/domain/free-tier/admin-approval-email.server';

const OUT = process.env.ADMIN_COPY_PASS1_EVIDENCE_DIR;
const TEACHER = 'Jordan Rivera';
const SCHOOL = 'Lincoln High School';
const TEACHER_EMAIL = 'jrivera@lincolnhs.org';
const ADMIN_EMAIL = 'patel@lincolnusd.org';
const ADMIN2_EMAIL = 'chen@lincolnusd.org';

const evidenceEnabled =
  !!OUT &&
  !!process.env.APPROVAL_V2_BASE_URL &&
  !!process.env.E2E_DATABASE_URL;

const db = createE2EPrismaClient();
const apps: string[] = [];
const users: string[] = [];

async function capture(page: import('@playwright/test').Page, id: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(OUT!, `${id}.png`),
    fullPage: true,
  });
}

async function captureEmail(
  page: import('@playwright/test').Page,
  id: string,
  html: string
) {
  await page.setContent(html, { waitUntil: 'networkidle' });
  await capture(page, id);
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
  const user = await db.user.create({
    data: {
      email: `pass1-evidence-${crypto.randomUUID()}@example.edu`,
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
      email: TEACHER_EMAIL,
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

for (const width of [1280, 390]) {
  test(`admin copy pass1 evidence at ${width}px`, async ({ page, context }) => {
    test.skip(!evidenceEnabled, 'Set ADMIN_COPY_PASS1_EVIDENCE_DIR');
    test.setTimeout(300_000);

    // Hide dev panel
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

    // ==== S1: Approve intro ====
    const app1 = await createSentApplication();
    const approval1 = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app1.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date('2026-10-14T15:02:00Z'),
      },
    });
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
    const forwardUrl1 = `${base}/free/admin/not-right-person?t=${encodeURIComponent(forwardMint1.token)}`;

    await page.goto(approveUrl1);
    await expect(
      page.getByRole('heading', {
        name: `Approve Yawp! for ${TEACHER} at ${SCHOOL}`,
      })
    ).toBeVisible();
    await capture(page, `01-s1-approve-intro-${suffix}`);

    // ==== S4: Thank you, teacher email failed ====
    // Approve the application
    await page.locator('input[name="adminRole"]').fill('Principal');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Approve Yawp!', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Thank you!' })
    ).toBeVisible();
    
    // Mark as email failed in DB
    await db.freeTierApplication.update({
      where: { id: app1.id },
      data: { status: 'APPROVED', teacherEmailFailed: true },
    });
    
    // Reload to show email failed state
    await page.reload();
    await expect(page.getByText('email failed', { exact: false })).toBeVisible();
    await capture(page, `03-s4-thank-you-teacher-email-failed-${suffix}`);

    // ==== S5: Paused ====
    const app2 = await createSentApplication();
    await db.freeTierApplication.update({
      where: { id: app2.id },
      data: { status: 'PAUSED' },
    });
    const approval2 = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app2.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
      },
    });
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
    await expect(
      page.getByRole('heading', { name: 'This request is paused' })
    ).toBeVisible();
    await capture(page, `05-s5-paused-${suffix}`);

    // ==== S9a: Couldn't open link, request known ====
    const app3 = await createSentApplication();
    const approval3 = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app3.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
      },
    });
    await page.goto(`${base}/free/admin/approve?t=invalid-token-${crypto.randomUUID()}`);
    await expect(
      page.getByRole('heading', { name: "We couldn't open this link" })
    ).toBeVisible();
    await expect(page.getByText(TEACHER)).toBeVisible();
    await expect(page.getByText(SCHOOL)).toBeVisible();
    await capture(page, `07-s9a-couldn-t-open-link-request-known-${suffix}`);

    // ==== S9b: Couldn't open link, request unknown ====
    await page.goto(`${base}/free/admin/approve?t=totally-invalid`);
    await expect(
      page.getByRole('heading', { name: "We couldn't open this link" })
    ).toBeVisible();
    await expect(page.getByText('contact support', { exact: false })).toBeVisible();
    await capture(page, `09-s9b-couldn-t-open-link-request-unknown-${suffix}`);

    // ==== S10a: Link replaced, forwarded ====
    const app4 = await createSentApplication();
    const approval4a = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app4.id,
        adminName: 'Sam Chen',
        adminEmail: ADMIN2_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
      },
    });
    const oldApproveMint4 = await mintFreeTierLinkForE2E(db, {
      applicationId: app4.id,
      purpose: 'ADMIN_APPROVE',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval4a.id },
      data: { signedLinkId: oldApproveMint4.linkId, forwardedAt: new Date() },
    });
    
    // Create new approval
    const approval4b = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app4.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
      },
    });
    const newApproveMint4 = await mintFreeTierLinkForE2E(db, {
      applicationId: app4.id,
      purpose: 'ADMIN_APPROVE',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval4b.id },
      data: { signedLinkId: newApproveMint4.linkId },
    });

    const oldApproveUrl4 = `${base}/free/admin/approve?t=${encodeURIComponent(oldApproveMint4.token)}`;
    await page.goto(oldApproveUrl4);
    await expect(
      page.getByRole('heading', { name: 'This link was replaced' })
    ).toBeVisible();
    await expect(page.getByText('forwarded', { exact: false })).toBeVisible();
    await capture(page, `11-s10a-link-replaced-forwarded-${suffix}`);

    // ==== S10b: Link replaced, resent ====
    const app5 = await createSentApplication();
    const approval5a = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app5.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
        resentAt: new Date(),
      },
    });
    const oldApproveMint5 = await mintFreeTierLinkForE2E(db, {
      applicationId: app5.id,
      purpose: 'ADMIN_APPROVE',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval5a.id },
      data: { signedLinkId: oldApproveMint5.linkId },
    });
    
    const newApproveMint5 = await mintFreeTierLinkForE2E(db, {
      applicationId: app5.id,
      purpose: 'ADMIN_APPROVE',
    });
    await db.freeTierAdminApproval.create({
      data: {
        applicationId: app5.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
        signedLinkId: newApproveMint5.linkId,
      },
    });

    const oldApproveUrl5 = `${base}/free/admin/approve?t=${encodeURIComponent(oldApproveMint5.token)}`;
    await page.goto(oldApproveUrl5);
    await expect(
      page.getByRole('heading', { name: 'This link was replaced' })
    ).toBeVisible();
    await expect(page.getByText('sent a new approval link', { exact: false })).toBeVisible();
    await capture(page, `13-s10b-link-replaced-resent-${suffix}`);

    // ==== S11: Forward form ====
    const app6 = await createSentApplication();
    const approval6 = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app6.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
      },
    });
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
    const approveUrl6 = `${base}/free/admin/approve?t=${encodeURIComponent(approveMint6.token)}`;
    const forwardUrl6 = `${base}/free/admin/not-right-person?t=${encodeURIComponent(forwardMint6.token)}&approveT=${encodeURIComponent(approveMint6.token)}`;

    await page.goto(forwardUrl6);
    await expect(
      page.getByRole('heading', { name: 'Send this to the right person' })
    ).toBeVisible();
    await capture(page, `15-s11-forward-form-${suffix}`);

    // ==== S12: Forward form, field errors ====
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Enter their name.', { exact: true })).toBeVisible();
    await page.getByLabel('Their email').fill('invalid-email');
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByText('valid email address', { exact: false })).toBeVisible();
    await capture(page, `17-s12-forward-form-field-errors-${suffix}`);

    // ==== S13a: Forward alert, same administrator ====
    await page.getByLabel('Their name').fill('Dr. Patel');
    await page.getByLabel('Their email').fill(ADMIN_EMAIL);
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('same email');
    await capture(page, `19-s13a-forward-alert-same-administrator-${suffix}`);

    // ==== S13b: Forward alert, chain cap ====
    // Create app with multiple forwards
    const app7 = await createSentApplication();
    for (let i = 0; i < 3; i++) {
      await db.freeTierAdminApproval.create({
        data: {
          applicationId: app7.id,
          adminName: `Admin ${i}`,
          adminEmail: `admin${i}@example.org`,
          emailCopyVersionHash: 'pass1-evidence',
          firstSentAt: new Date(),
          forwardedAt: new Date(),
        },
      });
    }
    const approval7 = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app7.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
      },
    });
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
    await page.getByLabel('Their name').fill('Next Admin');
    await page.getByLabel('Their email').fill('next@example.org');
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('chain');
    await capture(page, `21-s13b-forward-alert-chain-cap-${suffix}`);

    // ==== S13c: Forward alert, email failed ====
    const app8 = await createSentApplication();
    const approval8 = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app8.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
      },
    });
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

    // Simulate email send failure by setting failed flag after forward
    await page.goto(forwardUrl8);
    await page.getByLabel('Their name').fill('Next Admin');
    await page.getByLabel('Their email').fill('next@example.org');
    
    // Mock the forward to show email failed
    await page.route('**/api/free-tier/admin/forward', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ emailFailed: true }),
      });
    });
    
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('email', { timeout: 10000 });
    await capture(page, `23-s13c-forward-alert-email-failed-${suffix}`);

    // ==== S13d: Forward alert, same as teacher (NEW) ====
    const app9 = await createSentApplication();
    const approval9 = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app9.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
      },
    });
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
    await page.getByLabel('Their name').fill(TEACHER);
    await page.getByLabel('Their email').fill(TEACHER_EMAIL);
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('teacher', { timeout: 5000 });
    await capture(page, `25-s13d-forward-alert-same-as-teacher-new-${suffix}`);

    // ==== S14a: Unable to forward ====
    // Generic error state - mock a 500 error
    const app10 = await createSentApplication();
    const approval10 = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app10.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
      },
    });
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
    await page.getByLabel('Their name').fill('Next Admin');
    await page.getByLabel('Their email').fill('next@example.org');
    
    await page.route('**/api/free-tier/admin/forward', async (route) => {
      await route.fulfill({ status: 500 });
    });
    
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Unable to forward' })).toBeVisible();
    await capture(page, `27-s14a-unable-to-forward-${suffix}`);

    // ==== S14b: Unable to forward, rate limited ====
    const app11 = await createSentApplication();
    const approval11 = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app11.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
      },
    });
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
    await page.getByLabel('Their name').fill('Next Admin');
    await page.getByLabel('Their email').fill('next@example.org');
    
    await page.route('**/api/free-tier/admin/forward', async (route) => {
      await route.fulfill({
        status: 429,
        body: JSON.stringify({ error: 'rate_limited' }),
      });
    });
    
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByText('rate limit', { exact: false })).toBeVisible();
    await capture(page, `29-s14b-unable-to-forward-rate-limited-${suffix}`);

    // ==== S15a: Forwarded ====
    const app12 = await createSentApplication();
    const approval12 = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app12.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
      },
    });
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
    await page.getByLabel('Their name').fill('Next Admin');
    await page.getByLabel('Their email').fill('nextadmin@example.org');
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Request forwarded' })).toBeVisible();
    await capture(page, `31-s15a-forwarded-${suffix}`);

    // ==== S15b: Forwarded, manual review ====
    const app13 = await createSentApplication();
    const approval13 = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app13.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'pass1-evidence',
        firstSentAt: new Date(),
      },
    });
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
    
    // Mark for manual review
    await db.freeTierApplication.update({
      where: { id: app13.id },
      data: { requiresManualReview: true },
    });
    
    const forwardUrl13 = `${base}/free/admin/not-right-person?t=${encodeURIComponent(forwardMint13.token)}&approveT=${encodeURIComponent(approveMint13.token)}`;

    await page.goto(forwardUrl13);
    await page.getByLabel('Their name').fill('Next Admin');
    await page.getByLabel('Their email').fill('nextadmin@example.org');
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Request forwarded' })).toBeVisible();
    await expect(page.getByText('manual review', { exact: false })).toBeVisible();
    await capture(page, `33-s15b-forwarded-manual-review-${suffix}`);

    // ==== EMAIL SCREENSHOTS ====
    if (width === 1280) {
      // E1: Approval email, first request
      const e1Email = await buildDesignedAdminApprovalEmail({
        teacherName: TEACHER,
        teacherEmail: TEACHER_EMAIL,
        schoolName: SCHOOL,
        approveUrl: approveUrl1,
        notRightPersonUrl: forwardUrl1,
        pass1: true,
      });
      await captureEmail(page, '35-e1-approval-email-first-request-desktop', e1Email.html);

      // E2: Reminder, first admin
      const e2Email = await buildDesignedAdminApprovalEmail({
        teacherName: TEACHER,
        teacherEmail: TEACHER_EMAIL,
        schoolName: SCHOOL,
        approveUrl: approveUrl1,
        notRightPersonUrl: forwardUrl1,
        reminder: true,
        pass1: true,
      });
      await captureEmail(page, '37-e2-reminder-first-admin-desktop', e2Email.html);

      // E2f: Reminder, forwarded admin (FIX)
      const e2fEmail = await buildDesignedAdminApprovalEmail({
        teacherName: TEACHER,
        teacherEmail: TEACHER_EMAIL,
        schoolName: SCHOOL,
        approveUrl: approveUrl1,
        notRightPersonUrl: forwardUrl1,
        reminder: true,
        forwardedByAdminName: 'Sam Chen',
        pass1: true,
      });
      await captureEmail(page, '39-e2f-reminder-forwarded-admin-fix-desktop', e2fEmail.html);

      // E3: Forwarded by an admin
      const e3Email = await buildDesignedAdminApprovalEmail({
        teacherName: TEACHER,
        teacherEmail: TEACHER_EMAIL,
        schoolName: SCHOOL,
        approveUrl: approveUrl1,
        notRightPersonUrl: forwardUrl1,
        forwardedByAdminName: 'Sam Chen',
        pass1: true,
      });
      await captureEmail(page, '41-e3-forwarded-by-an-admin-desktop', e3Email.html);

      // E3b: Teacher asked another admin (NEW)
      const e3bEmail = await buildDesignedAdminApprovalEmail({
        teacherName: TEACHER,
        teacherEmail: TEACHER_EMAIL,
        schoolName: SCHOOL,
        approveUrl: approveUrl1,
        notRightPersonUrl: forwardUrl1,
        routedByTeacher: true,
        pass1: true,
      });
      await captureEmail(page, '43-e3b-teacher-asked-another-admin-new-desktop', e3bEmail.html);
    } else {
      // Mobile email screenshots
      const e1Email = await buildDesignedAdminApprovalEmail({
        teacherName: TEACHER,
        teacherEmail: TEACHER_EMAIL,
        schoolName: SCHOOL,
        approveUrl: approveUrl1,
        notRightPersonUrl: forwardUrl1,
        pass1: true,
      });
      await captureEmail(page, '36-e1-approval-email-first-request-mobile', e1Email.html);

      const e2Email = await buildDesignedAdminApprovalEmail({
        teacherName: TEACHER,
        teacherEmail: TEACHER_EMAIL,
        schoolName: SCHOOL,
        approveUrl: approveUrl1,
        notRightPersonUrl: forwardUrl1,
        reminder: true,
        pass1: true,
      });
      await captureEmail(page, '38-e2-reminder-first-admin-mobile', e2Email.html);

      const e2fEmail = await buildDesignedAdminApprovalEmail({
        teacherName: TEACHER,
        teacherEmail: TEACHER_EMAIL,
        schoolName: SCHOOL,
        approveUrl: approveUrl1,
        notRightPersonUrl: forwardUrl1,
        reminder: true,
        forwardedByAdminName: 'Sam Chen',
        pass1: true,
      });
      await captureEmail(page, '40-e2f-reminder-forwarded-admin-fix-mobile', e2fEmail.html);

      const e3Email = await buildDesignedAdminApprovalEmail({
        teacherName: TEACHER,
        teacherEmail: TEACHER_EMAIL,
        schoolName: SCHOOL,
        approveUrl: approveUrl1,
        notRightPersonUrl: forwardUrl1,
        forwardedByAdminName: 'Sam Chen',
        pass1: true,
      });
      await captureEmail(page, '42-e3-forwarded-by-an-admin-mobile', e3Email.html);

      const e3bEmail = await buildDesignedAdminApprovalEmail({
        teacherName: TEACHER,
        teacherEmail: TEACHER_EMAIL,
        schoolName: SCHOOL,
        approveUrl: approveUrl1,
        notRightPersonUrl: forwardUrl1,
        routedByTeacher: true,
        pass1: true,
      });
      await captureEmail(page, '44-e3b-teacher-asked-another-admin-new-mobile', e3bEmail.html);
    }
  });
}
