/**
 * Design evidence for admin deny + Q&A (deny-v1 / deny-v2 frames).
 * Set ADMIN_DENY_DESIGN_EVIDENCE_DIR and run with playwright e2e config.
 */
import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createE2EPrismaClient } from '../prisma-client';
import { mintFreeTierLinkForE2E } from '../helpers/mint-free-tier-link';
import { buildTeacherDeniedDesignedEmail } from '../../app/emails/build-free-tier-emails.server';

const OUT = process.env.ADMIN_DENY_DESIGN_EVIDENCE_DIR;
const TEACHER = 'Jordan Rivera';
const SCHOOL = 'Lincoln High School';
const evidenceEnabled =
  !!OUT &&
  !!process.env.APPROVAL_V2_BASE_URL &&
  !!process.env.E2E_DATABASE_URL;

const db = createE2EPrismaClient();
const apps: string[] = [];

async function capture(page: import('@playwright/test').Page, id: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(OUT!, `${id}.png`),
    fullPage: true,
  });
}

test.beforeAll(async () => {
  if (!OUT) return;
  await mkdir(OUT, { recursive: true });
  await db.setting.upsert({
    where: { name: 'feature_flag.free_tier' },
    create: { name: 'feature_flag.free_tier', value: 'true' },
    update: { value: 'true' },
  });
});

test.afterAll(async () => {
  await db.freeTierApplication.deleteMany({ where: { id: { in: apps } } });
  await db.$disconnect();
});

for (const width of [1440, 390]) {
  test(`admin deny and Q&A design evidence at ${width}px`, async ({ page }) => {
    test.skip(!evidenceEnabled, 'Set ADMIN_DENY_DESIGN_EVIDENCE_DIR');
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const base = process.env.APPROVAL_V2_BASE_URL!;
    const css = `${base}/app/app.css`;

    const app = await db.freeTierApplication.create({
      data: {
        email: `deny-evidence-${crypto.randomUUID()}@example.edu`,
        name: TEACHER,
        schoolName: SCHOOL,
        location: 'Local',
        gradeLevel: '11',
        status: 'SENT',
      },
    });
    apps.push(app.id);
    const approval = await db.freeTierAdminApproval.create({
      data: {
        applicationId: app.id,
        adminName: 'Dr. Patel',
        adminEmail: 'patel@lincolnusd.org',
        emailCopyVersionHash: 'design-evidence',
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

    const approveUrl = `${base}/free/admin/approve?t=${encodeURIComponent(mint.token)}`;
    const denyUrl = `${base}/free/admin/approve/deny?t=${encodeURIComponent(mint.token)}`;

    await page.goto(approveUrl, { waitUntil: 'networkidle' });
    await capture(page, `02_approve-page-with-deny-qanda-placeholder_${width === 390 ? 'mobile' : 'desktop'}`);
    await capture(page, `01_approve_qa_a_all_closed_${width === 390 ? 'mobile' : 'desktop'}`);

    await page.goto(denyUrl, { waitUntil: 'networkidle' });
    await capture(page, `04_deny-confirm_${width === 390 ? 'mobile' : 'desktop'}`);

    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/Thanks for letting us know|already answered/i);
    await capture(page, `10_after-deny-admin_${width === 390 ? 'mobile' : 'desktop'}`);

    await page.goto(approveUrl, { waitUntil: 'networkidle' });
    await capture(
      page,
      `12_link-opened-again-already-decided_${width === 390 ? 'mobile' : 'desktop'}`
    );

    const email = await buildTeacherDeniedDesignedEmail({
      teacherName: TEACHER,
      adminName: 'Dr. Patel',
      schoolName: SCHOOL,
      statusUrl: `${base}/app/free-tier/pending?ask=1`,
      chainCapReached: false,
    });
    await page.setContent(email.html, { waitUntil: 'networkidle' });
    await capture(page, `24_teacher-deny-email_${width === 390 ? 'mobile' : 'desktop'}`);

    await writeFile(
      path.join(OUT!, `evidence-manifest-${width}.json`),
      JSON.stringify({ width, capturedAt: new Date().toISOString() }, null, 2)
    );
    expect(await page.title()).toBeTruthy();
  });
}
