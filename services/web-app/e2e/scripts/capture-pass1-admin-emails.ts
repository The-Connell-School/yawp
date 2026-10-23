/**
 * Renders pass1 admin approval email HTML and captures PNGs (E1, E2, E2f, E3, E3b).
 * Uses placeholder link hosts — no real tokens in output filenames or logs.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { buildDesignedAdminApprovalEmail } from '../../app/domain/free-tier/admin-approval-email.server';

const evidenceDir = process.env.ADMIN_COPY_PASS1_EVIDENCE_DIR;
if (!evidenceDir) {
  console.error('Set ADMIN_COPY_PASS1_EVIDENCE_DIR');
  process.exit(1);
}
const OUT = evidenceDir;

const TEACHER = 'Jordan Rivera';
const SCHOOL = 'Lincoln High School';
const TEACHER_EMAIL = 'jrivera@lincolnhs.org';
const approveUrl = 'https://example.test/free/admin/approve?t=evidence-placeholder';
const notRightPersonUrl =
  'https://example.test/free/admin/not-right-person?t=evidence-placeholder';

async function captureEmail(
  page: import('@playwright/test').Page,
  id: string,
  html: string
) {
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(OUT, `${id}.png`),
    fullPage: true,
  });
}

for (const width of [1280, 390]) {
  const browser = await chromium.launch({
    executablePath: process.env.PW_EXECUTABLE_PATH,
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  const suffix = width === 1280 ? 'desktop' : 'mobile';

  type EmailFlags = Pick<
    Parameters<typeof buildDesignedAdminApprovalEmail>[0],
    'pass1' | 'reminder' | 'forwardedByAdminName' | 'routedByTeacher'
  >;
  const cases: Array<[string, EmailFlags]> =
    [
      [
        width === 1280
          ? '35-e1-approval-email-first-request-desktop'
          : '36-e1-approval-email-first-request-mobile',
        { pass1: true },
      ],
      [
        width === 1280
          ? '37-e2-reminder-first-admin-desktop'
          : '38-e2-reminder-first-admin-mobile',
        { reminder: true, pass1: true },
      ],
      [
        width === 1280
          ? '39-e2f-reminder-forwarded-admin-fix-desktop'
          : '40-e2f-reminder-forwarded-admin-fix-mobile',
        {
          reminder: true,
          forwardedByAdminName: 'Sam Chen',
          pass1: true,
        },
      ],
      [
        width === 1280
          ? '41-e3-forwarded-by-an-admin-desktop'
          : '42-e3-forwarded-by-an-admin-mobile',
        { forwardedByAdminName: 'Sam Chen', pass1: true },
      ],
      [
        width === 1280
          ? '43-e3b-teacher-asked-another-admin-new-desktop'
          : '44-e3b-teacher-asked-another-admin-new-mobile',
        { routedByTeacher: true, pass1: true },
      ],
    ];

  await mkdir(OUT, { recursive: true });

  for (const [id, extra] of cases) {
    const designed = await buildDesignedAdminApprovalEmail({
      teacherName: TEACHER,
      teacherEmail: TEACHER_EMAIL,
      schoolName: SCHOOL,
      approveUrl,
      notRightPersonUrl,
      ...extra,
    });
    await captureEmail(page, id, designed.html);
  }

  await browser.close();
}
