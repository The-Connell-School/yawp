/**
 * Renders admin copy evidence PNGs for design review (round 2).
 * Output: /opt/cursor/artifacts/admin-copy-evidence/round2/
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { adminApprovalPass1ForwardBanner } from '../app/domain/free-tier/admin-approval-copy';
import { buildDesignedAdminApprovalEmail } from '../app/domain/free-tier/admin-approval-email.server';

const OUT = '/opt/cursor/artifacts/admin-copy-evidence/round2';
const TEACHER = 'Jordan Rivera';
const SCHOOL = 'Lincoln High School';
const TEACHER_EMAIL = 'teacher@example.test';
const FORWARDER = 'Dr. Patel';
const APPROVE = 'https://yawp.test/free/admin/approve?t=REDACTED';
const FORWARD = 'https://yawp.test/free/admin/not-right-person?t=REDACTED';

async function emailBodyHtml(args: {
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

const PENDING_REASONS = [
  'same_as_teacher',
  'same_administrator',
  'chain_cap',
  'email_failed',
] as const;

function pageDocument(body: string, cssHref: string, baseUrl: string) {
  return `<!DOCTYPE html><html lang="en" class="h-full"><head><meta charset="utf-8"/><base href="${baseUrl}/"/><link rel="stylesheet" href="${cssHref}"/></head><body class="h-full">${body}</body></html>`;
}

function renderPendingFixtures(outDir: string) {
  const tmp = path.join(outDir, '_pending-html');
  mkdirSync(tmp, { recursive: true });
  for (const reason of PENDING_REASONS) {
    for (const mode of ['before-main', 'after-head'] as const) {
      const result = spawnSync(
        'bun',
        [
          'run',
          'scripts/pending-admin-copy-evidence.ssr.tsx',
          tmp,
          mode,
          reason,
        ],
        { cwd: path.join(import.meta.dirname, '..'), stdio: 'inherit' }
      );
      if (result.status !== 0) {
        throw new Error(`pending SSR failed for ${reason} ${mode}`);
      }
    }
  }
  return tmp;
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

async function main() {
  await mkdir(OUT, { recursive: true });
  const baseUrl =
    process.env.ADMIN_COPY_EVIDENCE_BASE_URL?.replace(/\/$/, '') ??
    'http://localhost:5194';
  process.env.PRIMARY_APP_URL = baseUrl;
  const cssHref = `${baseUrl}/app/app.css`;
  const pendingHtmlDir = renderPendingFixtures(OUT);
  const browser = await chromium.launch();
  const widths = [320, 1280] as const;

  const wrapEmail = async (args: Parameters<typeof emailBodyHtml>[0]) =>
    pageDocument(await emailBodyHtml(args), cssHref, baseUrl);

  await screenshotHtml(
    browser,
    await wrapEmail({ pass1: true }),
    'e1-banner-after-head',
    [...widths]
  );
  await screenshotHtml(
    browser,
    await wrapEmail({ pass1: true, reminder: true }),
    'e2-banner-after-head',
    [...widths]
  );

  await screenshotHtml(
    browser,
    await wrapEmail({ pass1: false, forwardedByAdminName: FORWARDER }),
    'e3-banner-before-main',
    [...widths]
  );
  await screenshotHtml(
    browser,
    await wrapEmail({ pass1: true, forwardedByAdminName: FORWARDER }),
    'e3-banner-after-head',
    [...widths]
  );

  await screenshotHtml(
    browser,
    await wrapEmail({ pass1: false, reminder: true }),
    'e2f-banner-before-main',
    [...widths]
  );
  await screenshotHtml(
    browser,
    await wrapEmail({
      pass1: true,
      reminder: true,
      forwardedByAdminName: FORWARDER,
    }),
    'e2f-banner-after-head',
    [...widths]
  );

  const pendingSlugs = [
    'pending-same-as-teacher',
    'pending-same-administrator',
    'pending-chain-cap',
    'pending-email-failed',
  ];
  for (const slug of pendingSlugs) {
    for (const suffix of ['before-main', 'after-head'] as const) {
      const fragmentPath = path.join(pendingHtmlDir, `${slug}-${suffix}.html`);
      const body = readFileSync(fragmentPath, 'utf8');
      await screenshotHtml(
        browser,
        pageDocument(body, cssHref, baseUrl),
        `${slug}-${suffix}`,
        [...widths]
      );
    }
  }

  await browser.close();

  const index = `# Admin copy evidence — round 2

Pinned pass1 forward banner: ${adminApprovalPass1ForwardBanner(FORWARDER, TEACHER, SCHOOL)}

## Email banners (HTML)
- e1-banner-after-head-{320,1280}.png — pass1 E1 first admin request (frame 35)
- e2-banner-after-head-{320,1280}.png — pass1 E2 reminder (frame 37, no forward banner)
- e2f-banner-before-main-{320,1280}.png — main reminder email (pass1 off, no E2f forward banner)
- e2f-banner-after-head-{320,1280}.png — pass1 E2f reminder email (forwarded admin)
- e3-banner-before-main-{320,1280}.png — legacy forward banner, pass1 off
- e3-banner-after-head-{320,1280}.png — pass1 E3 forward recipient email

## Teacher pending alerts (full app.free-tier.pending card chrome)
- pending-*-before-main-{320,1280}.png — legacy approvalForwardError(reason) on main
- pending-*-after-head-{320,1280}.png — teacherPendingForwardError (this branch)

Tokens and emails redacted in rendered fixtures.
`;
  await writeFile(path.join(OUT, 'INDEX.txt'), index);
  console.log(`Wrote evidence to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
