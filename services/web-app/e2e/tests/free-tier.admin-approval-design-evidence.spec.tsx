/**
 * Design evidence for admin approval screens 01–10 at 1440 and 390.
 * Fake fixture data only. Run with ADMIN_APPROVAL_DESIGN_EVIDENCE_DIR set.
 */
import React from 'react';
import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createE2EPrismaClient } from '../prisma-client';
import { mintFreeTierLinkForE2E } from '../helpers/mint-free-tier-link';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderAdminApprovalEmailHtml } from '../../app/domain/free-tier/admin-approval-email-html.server';
import {
  AdminAlreadyApprovedCard,
  AdminDeclinedCard,
  AdminLinkExpiredCard,
  AdminThankYouCard,
} from '../../app/routes/free-tier/AdminApprovalStates';

const OUT = process.env.ADMIN_APPROVAL_DESIGN_EVIDENCE_DIR;
const TEACHER = 'Jordan Rivera';
const SCHOOL = 'Lincoln High School';
const TEACHER_EMAIL = 'jrivera@lincolnhs.org';
const ADMIN_EMAIL = 'patel@lincolnusd.org';

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

async function captureEmail(page: import('@playwright/test').Page, id: string, html: string) {
  await page.setContent(html, { waitUntil: 'networkidle' });
  await capture(page, id);
}

async function captureStatusCard(
  page: import('@playwright/test').Page,
  id: string,
  card: React.ReactElement,
) {
  const css = `${process.env.APPROVAL_V2_BASE_URL}/app/app.css`;
  const body = renderToStaticMarkup(card);
  await page.setContent(
    `<!DOCTYPE html><html lang="en" class="h-full"><head><meta charset="utf-8"/><link rel="stylesheet" href="${css}"/></head><body class="h-full">${body}</body></html>`,
    { waitUntil: 'networkidle' }
  );
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
  const octets = crypto.getRandomValues(new Uint8Array(2));
  const user = await db.user.create({
    data: {
      email: `design-evidence-${crypto.randomUUID()}@example.edu`,
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

for (const width of [1440, 390]) {
  test(`admin approval design screens at ${width}px`, async ({ page }) => {
    test.skip(!evidenceEnabled, 'Set ADMIN_APPROVAL_DESIGN_EVIDENCE_DIR');
    test.setTimeout(180_000);
    const octets = crypto.getRandomValues(new Uint8Array(2));
    await page.context().setExtraHTTPHeaders({
      'x-forwarded-for': `198.18.${octets[0]}.${octets[1]}`,
    });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });

    const app = await createSentApplication();

    const approval = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'design-evidence',
        firstSentAt: new Date('2026-10-14T15:02:00Z'),
      },
    });

    const approveMint = await mintFreeTierLinkForE2E(db, {
      applicationId: app.id,
      purpose: 'ADMIN_APPROVE',
    });
    const forwardMint = await mintFreeTierLinkForE2E(db, {
      applicationId: app.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval.id },
      data: { signedLinkId: approveMint.linkId },
    });

    const base = process.env.APPROVAL_V2_BASE_URL!;
    const approveUrl = `${base}/free/admin/approve?t=${encodeURIComponent(approveMint.token)}`;
    const forwardUrl = `${base}/free/admin/not-right-person?t=${encodeURIComponent(forwardMint.token)}`;

    // 01 — initial approval email
    await captureEmail(
      page,
      `${width}-01-approval-email`,
      renderAdminApprovalEmailHtml({
        teacherName: TEACHER,
        teacherEmail: TEACHER_EMAIL,
        schoolName: SCHOOL,
        approveUrl,
        notRightPersonUrl: forwardUrl,
      })
    );

    // 02a — approve form (default)
    await page.goto(approveUrl);
    await expect(
      page.getByRole('heading', {
        name: `Approve Yawp! for ${TEACHER} at ${SCHOOL}`,
      })
    ).toBeVisible();
    await capture(page, `${width}-02a-approve-form`);

    // 02b — role + checkbox filled
    await page.locator('input[name="adminRole"]').fill('Principal');
    await page.getByRole('checkbox').check();
    await capture(page, `${width}-02b-approve-filled`);

    // 02c — validation errors
    await page.locator('input[name="adminRole"]').fill('');
    await page.getByRole('checkbox').uncheck();
    await page.getByRole('button', { name: 'Approve Yawp!', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Two things need your attention before you can approve.'
    );
    await capture(page, `${width}-02c-approve-validation`);

    // 03 — thank you (terminal card; fake fixture data)
    await captureStatusCard(
      page,
      `${width}-03-thank-you`,
      React.createElement(AdminThankYouCard, {
        teacherName: TEACHER,
        schoolName: SCHOOL,
      })
    );

    // 04 — already approved
    await captureStatusCard(
      page,
      `${width}-04-already-approved`,
      React.createElement(AdminAlreadyApprovedCard, {
        teacherName: TEACHER,
        schoolName: SCHOOL,
      })
    );
    const forwardOnlyApp = await createSentApplication();
    const forwardApproval = await db.freeTierAdminApproval.create({
      data: {
        applicationId: forwardOnlyApp.id,
        adminName: 'Dr. Patel',
        adminEmail: ADMIN_EMAIL,
        emailCopyVersionHash: 'design-evidence',
        firstSentAt: new Date(),
      },
    });
    const fwdApprove = await mintFreeTierLinkForE2E(db, {
      applicationId: forwardOnlyApp.id,
      purpose: 'ADMIN_APPROVE',
    });
    const fwdForward = await mintFreeTierLinkForE2E(db, {
      applicationId: forwardOnlyApp.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    await db.freeTierAdminApproval.update({
      where: { id: forwardApproval.id },
      data: { signedLinkId: fwdApprove.linkId },
    });
    const fwdApproveUrl = `${base}/free/admin/approve?t=${encodeURIComponent(fwdApprove.token)}`;
    const fwdForwardUrl = `${base}/free/admin/not-right-person?t=${encodeURIComponent(fwdForward.token)}`;

    // 05 — forward form
    await page.goto(fwdForwardUrl);
    await expect(
      page.getByRole('heading', { name: 'Forward this request' })
    ).toBeVisible();
    await capture(page, `${width}-05-forward-form`);

    // 06 — forward sent
    await page.getByLabel('Administrator name').fill('Ms. Rivera');
    await page.getByLabel('Administrator email').fill('rivera@example.org');
    await page.getByRole('button', { name: 'Forward request', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Forward sent' })).toBeVisible();
    await capture(page, `${width}-06-forward-sent`);

    // 07 — forward recipient email
    await captureEmail(
      page,
      `${width}-07-forward-recipient-email`,
      renderAdminApprovalEmailHtml({
        teacherName: TEACHER,
        teacherEmail: TEACHER_EMAIL,
        schoolName: SCHOOL,
        approveUrl: fwdApproveUrl,
        notRightPersonUrl: fwdForwardUrl,
        forwardedByAdminName: 'Sam Chen',
      })
    );

    // 10 — link replaced (old approve link after forward)
    await page.goto(fwdApproveUrl);
    await expect(
      page.getByRole('heading', { name: 'This link was replaced' })
    ).toBeVisible();
    await capture(page, `${width}-10-link-replaced`);

    // 08a — expired
    await captureStatusCard(
      page,
      `${width}-08a-expired`,
      React.createElement(AdminLinkExpiredCard, {
        teacherName: TEACHER,
        schoolName: SCHOOL,
      })
    );

    // 09 — declined
    await captureStatusCard(
      page,
      `${width}-09-declined`,
      React.createElement(AdminDeclinedCard, {
        teacherName: TEACHER,
        schoolName: SCHOOL,
      })
    );

    // 08b — invalid
    await page.goto(`${base}/free/admin/approve?t=invalid`);
    await expect(
      page.getByRole('heading', { name: "We couldn't open this link" })
    ).toBeVisible();
    await capture(page, `${width}-08b-invalid`);

    await writeFile(
      path.join(OUT!, `manifest-${width}.json`),
      JSON.stringify({ width, teacher: TEACHER, school: SCHOOL }, null, 2)
    );
  });
}
