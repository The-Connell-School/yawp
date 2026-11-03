/**
 * Follow-up evidence for admin deny Q&A and teacher denied.
 */
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createCookieSessionStorage } from 'react-router';
import { createE2EPrismaClient } from '../prisma-client';
import { mintFreeTierLinkForE2E } from '../helpers/mint-free-tier-link';
import { provisionFreeClassroomForE2E } from '../helpers/provision-free-classroom-for-e2e';

const OUT =
  process.env.ADMIN_DENY_FOLLOWUP_EVIDENCE_DIR ??
  '/opt/cursor/artifacts/admin-deny-followup';
const evidenceEnabled =
  !!process.env.APPROVAL_V2_BASE_URL &&
  !!process.env.E2E_DATABASE_URL &&
  !!process.env.SESSION_SECRET;

const db = createE2EPrismaClient();
const apps: string[] = [];
const users: string[] = [];

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
      email: `deny-followup-${crypto.randomUUID()}@example.edu`,
      name: 'Jordan Rivera',
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
      name: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
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
      adminName: 'Dr. Patel',
      adminEmail: 'patel@lincolnusd.org',
      emailCopyVersionHash: 'followup-evidence',
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

test.afterAll(async () => {
  await db.freeTierApplication.deleteMany({ where: { id: { in: apps } } });
  await db.orgMembership.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

for (const width of [1440, 390]) {
  test(`follow-up evidence at ${width}px`, async ({ page }) => {
    test.skip(!evidenceEnabled, 'Set APPROVAL_V2_BASE_URL, E2E_DATABASE_URL, SESSION_SECRET');
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const base = process.env.APPROVAL_V2_BASE_URL!;
    const suffix = viewportSuffix(width);

    const seed = await seedPendingApproval();
    const approveUrl = `${base}/free/admin/approve?t=${encodeURIComponent(seed.mint.token)}`;
    await page.goto(approveUrl, { waitUntil: 'networkidle' });
    if (width === 1440) {
      await capture(page, `frame_compare_deny-v2_01_approve_${suffix}`);
    }
    await page.getByRole('button', { name: 'What Yawp! is' }).click();
    await capture(page, `deny-v2_approve_qa_b_one_question_open_${suffix}`);

    await page.getByRole('button', { name: 'Questions about student privacy?' }).click();
    await capture(page, `deny-v2_approve_qa_privacy_long_${suffix}`);

    const denyDoneSeed = await seedPendingApproval();
    const denyDenyUrl = `${base}/free/admin/approve/deny?t=${encodeURIComponent(denyDoneSeed.mint.token)}`;
    await page.goto(denyDenyUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Deny request', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Thanks for letting us know' })
    ).toBeVisible();

    await loginTeacher(page, denyDoneSeed.user.id);
    await page.goto(`${base}/app/free-tier/pending`, { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('heading', { name: "Your request wasn't approved" })
    ).toBeVisible();
    const explore = page.getByRole('link', { name: 'Explore my classroom' });
    await expect(explore).toHaveCSS('text-decoration-line', 'underline');
    await capture(page, `14_teacher-denied-status-page_${suffix}`);
    if (width === 1440) {
      await capture(page, `frame_compare_deny-v2_14_teacher_denied_${suffix}`);
    }
  });
}
