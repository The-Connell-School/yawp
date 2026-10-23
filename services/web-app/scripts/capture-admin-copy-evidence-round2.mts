/**
 * Renders admin copy evidence PNGs for design review (round 2).
 * Output: /opt/cursor/artifacts/admin-copy-evidence/round2/
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import {
  adminApprovalPass1ForwardBanner,
  teacherPendingForwardError,
} from '../app/domain/free-tier/admin-approval-copy';
import { buildDesignedAdminApprovalEmail } from '../app/domain/free-tier/admin-approval-email.server';
import { AdminApprovalEmail } from '../app/emails/transactional-emails';

const OUT = '/opt/cursor/artifacts/admin-copy-evidence/round2';
const TEACHER = 'Jordan Rivera';
const SCHOOL = 'Lincoln High School';
const TEACHER_EMAIL = 'teacher@example.org';
const FORWARDER = 'Dr. Patel';
const APPROVE = 'https://yawp.test/free/admin/approve?t=REDACTED';
const FORWARD = 'https://yawp.test/free/admin/not-right-person?t=REDACTED';

async function emailHtml(args: {
  pass1: boolean;
  reminder?: boolean;
  forwardedByAdminName?: string;
}) {
  const designed = await buildDesignedAdminApprovalEmail({
    teacherName: TEACHER,
    teacherEmail: TEACHER_EMAIL,
    schoolName: SCHOOL,
    approveUrl: APPROVE,
    notRightPersonUrl: FORWARD,
    forwardedByAdminName: args.forwardedByAdminName,
    reminder: args.reminder,
    pass1: args.pass1,
  });
  return designed.html;
}

function pendingAlertHtml(message: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    body { font-family: system-ui, sans-serif; margin: 16px; background: #fff; }
    [role="alert"] { color: #dc2626; font-size: 14px; line-height: 1.4; max-width: 360px; }
  </style></head><body><p role="alert">${message}</p></body></html>`;
}

async function screenshotHtml(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  html: string,
  fileBase: string,
  widths: number[]
) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.screenshot({
      path: path.join(OUT, `${fileBase}-${width}.png`),
      fullPage: true,
    });
    await page.close();
  }
}

async function bannerCropHtml(
  pass1: boolean,
  reminder: boolean,
  forwardedByAdminName: string
) {
  const markup = renderToStaticMarkup(
    React.createElement(AdminApprovalEmail, {
      teacherName: TEACHER,
      teacherEmail: TEACHER_EMAIL,
      schoolName: SCHOOL,
      approveUrl: APPROVE,
      notRightPersonUrl: FORWARD,
      forwardedByAdminName,
      reminder,
      pass1,
      origin: 'https://yawp.test',
    })
  );
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    body { margin: 0; background: #f4f4f5; }
    .wrap { max-width: 600px; margin: 0 auto; background: #fff; }
  </style></head><body><div class="wrap">${markup}</div></body></html>`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const widths = [320, 1280] as const;

  const e3After = await emailHtml({
    pass1: true,
    forwardedByAdminName: FORWARDER,
  });
  const e3Before = await emailHtml({
    pass1: false,
    forwardedByAdminName: FORWARDER,
  });
  await screenshotHtml(browser, e3Before, 'e3-banner-before-main', [...widths]);
  await screenshotHtml(browser, e3After, 'e3-banner-after-head', [...widths]);

  const e2fBefore = await bannerCropHtml(false, true, FORWARDER);
  const e2fAfter = await bannerCropHtml(true, true, FORWARDER);
  await screenshotHtml(browser, e2fBefore, 'e2f-banner-before-main', [...widths]);
  await screenshotHtml(browser, e2fAfter, 'e2f-banner-after-head', [...widths]);

  const alerts: Array<[string, string]> = [
    [
      'pending-same-as-teacher',
      teacherPendingForwardError({
        reason: 'same_as_teacher',
        schoolName: SCHOOL,
      }),
    ],
    [
      'pending-same-administrator',
      teacherPendingForwardError({
        reason: 'same_administrator',
        schoolName: SCHOOL,
        adminName: FORWARDER,
      }),
    ],
    [
      'pending-chain-cap',
      teacherPendingForwardError({ reason: 'chain_cap', schoolName: SCHOOL }),
    ],
    [
      'pending-email-failed',
      teacherPendingForwardError({ reason: 'email_failed', schoolName: SCHOOL }),
    ],
  ];
  for (const [slug, message] of alerts) {
    const html = pendingAlertHtml(message);
    await screenshotHtml(browser, html, `${slug}-after-head`, [...widths]);
  }

  await browser.close();

  const index = `# Admin copy evidence — round 2

Pinned pass1 forward banner: ${adminApprovalPass1ForwardBanner(FORWARDER, TEACHER, SCHOOL)}

## Email banners (HTML)
- e2f-banner-before-main-{320,1280}.png — legacy forward banner, pass1 off
- e2f-banner-after-head-{320,1280}.png — pass1 E2f reminder email (forwarded admin)
- e3-banner-before-main-{320,1280}.png — legacy forward banner, pass1 off
- e3-banner-after-head-{320,1280}.png — pass1 E3 forward recipient email

## Teacher pending alerts (after head)
- pending-same-as-teacher-after-head-{320,1280}.png
- pending-same-administrator-after-head-{320,1280}.png
- pending-chain-cap-after-head-{320,1280}.png
- pending-email-failed-after-head-{320,1280}.png

Tokens and emails redacted in rendered fixtures.
`;
  await writeFile(path.join(OUT, 'INDEX.txt'), index);
  console.log(`Wrote evidence to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
