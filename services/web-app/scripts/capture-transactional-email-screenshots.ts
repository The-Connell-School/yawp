import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startEmailAssetServer } from '../app/emails/local-asset-server';
import {
  buildAdminApprovalDesignedEmail,
  buildTeacherApprovedDesignedEmail,
  buildTeacherForwardedDesignedEmail,
  buildTeacherReleaseDesignedEmail,
  buildTeacherStillWaitingDesignedEmail,
} from '../app/emails/build-free-tier-emails.server';
import {
  buildClassInviteEmail,
  buildOrgTeacherInviteEmail,
  buildResetPasswordEmail,
  buildSchoolSetupInviteEmail,
  buildSignInCodeEmail,
  buildWelcomeVerifyEmail,
} from '../app/emails/build-account-emails.server';

const outDir =
  process.env.EMAIL_SCREENSHOT_DIR ?? '/opt/cursor/artifacts/email-screenshots';

type Capture = { name: string; html: string };

async function captures(): Promise<Capture[]> {
  const urls = {
    join: 'https://yawp.test/free/join?t=fake',
    pending: 'https://yawp.test/app/free-tier/pending',
    approve: 'https://yawp.test/free/admin/approve?t=fake',
    forward: 'https://yawp.test/free/admin/not-right-person?t=fake',
    signIn: 'https://yawp.test/auth/login',
  };
  const specs = [
    [
      '01-teacher-spot-ready',
      await buildTeacherReleaseDesignedEmail({
        name: 'Dana Whitaker',
        joinUrl: urls.join,
      }),
    ],
    [
      '02-teacher-still-waiting',
      await buildTeacherStillWaitingDesignedEmail({
        teacherName: 'Dana Whitaker',
        adminName: 'Dr. Ramos',
        exploreUrl: urls.pending,
        changeAdminUrl: urls.pending,
      }),
    ],
    [
      '03a-teacher-forwarded',
      await buildTeacherForwardedDesignedEmail({
        teacherName: 'Dana Whitaker',
        adminName: 'Dr. Ramos',
        adminEmail: 'm.ramos@lincolnhs.org',
        manualReview: false,
        pendingUrl: urls.pending,
      }),
    ],
    [
      '03b-teacher-forwarded-team-review',
      await buildTeacherForwardedDesignedEmail({
        teacherName: 'Dana Whitaker',
        adminName: 'Dr. Ramos',
        adminEmail: 'm.ramos@lincolnhs.org',
        manualReview: true,
        pendingUrl: urls.pending,
      }),
    ],
    [
      '04-teacher-approved',
      await buildTeacherApprovedDesignedEmail({
        teacherName: 'Dana Whitaker',
        adminName: 'Dr. Ramos',
        signInUrl: urls.signIn,
      }),
    ],
    [
      '05-admin-approval',
      await buildAdminApprovalDesignedEmail({
        teacherName: 'Dana Whitaker',
        teacherEmail: 'd.whitaker@lincolnhs.org',
        schoolName: 'Lincoln High School',
        approveUrl: urls.approve,
        notRightPersonUrl: urls.forward,
      }),
    ],
    [
      '06-admin-forwarded',
      await buildAdminApprovalDesignedEmail({
        teacherName: 'Dana Whitaker',
        teacherEmail: 'd.whitaker@lincolnhs.org',
        schoolName: 'Lincoln High School',
        approveUrl: urls.approve,
        notRightPersonUrl: urls.forward,
        forwardedByAdminName: 'Ms. Patel',
      }),
    ],
    [
      '07-admin-reminder',
      await buildAdminApprovalDesignedEmail({
        teacherName: 'Dana Whitaker',
        teacherEmail: 'd.whitaker@lincolnhs.org',
        schoolName: 'Lincoln High School',
        approveUrl: urls.approve,
        notRightPersonUrl: urls.forward,
        reminder: true,
      }),
    ],
    ['08-sign-in-code', await buildSignInCodeEmail('482913')],
    [
      '09-reset-password',
      await buildResetPasswordEmail({
        code: '482913',
        resetUrl: 'https://yawp.test/reset/fake',
      }),
    ],
    [
      '10-welcome-verify',
      await buildWelcomeVerifyEmail({
        firstName: 'Jordan',
        code: '482913',
        verifyUrl: 'https://yawp.test/verify/fake',
      }),
    ],
    [
      '11-class-invite',
      await buildClassInviteEmail({
        teacherName: 'Ms. Whitaker',
        className: 'English 10, Period 3',
        schoolName: 'Lincoln High School',
        joinUrl: 'https://yawp.test/join/fake',
      }),
    ],
    [
      '12-org-invite',
      await buildOrgTeacherInviteEmail({
        firstName: 'Alex',
        inviterName: 'Sam Ortiz',
        schoolName: 'Lincoln High School',
        acceptUrl: 'https://yawp.test/invite/fake',
      }),
    ],
    [
      '13-school-setup',
      await buildSchoolSetupInviteEmail({
        firstName: 'Dr. Okafor',
        schoolName: 'Lincoln High School',
        acceptUrl: 'https://yawp.test/invite/owner/fake',
        expiresInDays: 7,
        personalNote: 'Thanks for the call on Tuesday.',
      }),
    ],
  ] as const;
  return specs.map(([name, rendered]) => ({ name, html: rendered.html }));
}

async function screenshot(page: import('playwright').Page, html: string, file: string) {
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: file, fullPage: true });
}

/** Simulate blocked images: dashed wordmark box (design frame 62). */
function htmlWithBlockedLogos(html: string) {
  const fallback = `<div style="width:112px;height:57px;border:1px dashed #b8b4a8;box-sizing:border-box;font-family:Georgia,serif;font-size:22px;font-weight:700;color:#3c3828;display:flex;align-items:center;padding-left:10px">Yawp!</div>`;
  return html
    .replace(/<img[^>]*class="yawp-logo-light"[^>]*\/?>/gi, fallback)
    .replace(/<img[^>]*class="yawp-logo-dark"[^>]*\/?>/gi, '');
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const publicRoot = path.join(import.meta.dir, '../public');
  const assetServer = await startEmailAssetServer(publicRoot);
  process.env.PRIMARY_APP_URL = assetServer.origin;
  const browser = await chromium.launch();
  const desktop = await browser.newPage({ viewport: { width: 600, height: 1200 } });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 1400 } });
  const dark = await browser.newPage({
    viewport: { width: 600, height: 1200 },
    colorScheme: 'dark',
  });
  const imagesOff = await browser.newPage({ viewport: { width: 600, height: 1200 } });

  const all = await captures();
  for (const capture of all) {
    await screenshot(
      desktop,
      capture.html,
      path.join(outDir, `${capture.name}-desktop-600.png`)
    );
    await screenshot(
      mobile,
      capture.html,
      path.join(outDir, `${capture.name}-mobile-390.png`)
    );
  }

  const release = all[0]!.html;
  await screenshot(dark, release, path.join(outDir, '01-teacher-release-dark-600.png'));
  await screenshot(
    imagesOff,
    htmlWithBlockedLogos(release),
    path.join(outDir, '01-teacher-release-images-off-600.png')
  );

  await browser.close();
  await assetServer.close();
  await writeFile(
    path.join(outDir, 'manifest.json'),
    JSON.stringify({ outDir, logoBase: `${assetServer.origin}/img/` }, null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
