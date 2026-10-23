/**
 * Before/after pass1 admin email layout evidence (E2, E2f, E3).
 * Output: /opt/cursor/artifacts/admin-copy-polish/
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { buildDesignedAdminApprovalEmail } from '../app/domain/free-tier/admin-approval-email.server';

const OUT = '/opt/cursor/artifacts/admin-copy-polish';
const TEACHER = 'Jordan Rivera';
const SCHOOL = 'Lincoln High School';
const TEACHER_EMAIL = 'a***@example.test';
const FORWARDER = 'Dr. Patel';
const APPROVE = 'https://yawp.test/free/admin/approve?t=REDACTED';
const FORWARD = 'https://yawp.test/free/admin/not-right-person?t=REDACTED';
const widths = [320, 1280] as const;

type Variant = 'e2' | 'e2f' | 'e3';

async function emailHtml(variant: Variant) {
  const designed = await buildDesignedAdminApprovalEmail({
    teacherName: TEACHER,
    teacherEmail: TEACHER_EMAIL,
    schoolName: SCHOOL,
    approveUrl: APPROVE,
    notRightPersonUrl: FORWARD,
    pass1: true,
    reminder: variant === 'e2' || variant === 'e2f',
    forwardedByAdminName: variant === 'e2f' || variant === 'e3' ? FORWARDER : undefined,
  });
  return designed.html;
}

function pageDocument(body: string, cssHref: string, baseUrl: string) {
  return `<!DOCTYPE html><html lang="en" class="h-full"><head><meta charset="utf-8"/><base href="${baseUrl}/"/><link rel="stylesheet" href="${cssHref}"/></head><body class="h-full">${body}</body></html>`;
}

async function main() {
  const phase = process.argv[2];
  if (phase !== 'before' && phase !== 'after') {
    throw new Error('Usage: bun run scripts/capture-admin-copy-polish-evidence.mts before|after');
  }
  await mkdir(OUT, { recursive: true });
  const baseUrl =
    process.env.ADMIN_COPY_EVIDENCE_BASE_URL?.replace(/\/$/, '') ??
    'http://localhost:5194';
  process.env.PRIMARY_APP_URL = baseUrl;
  const cssHref = `${baseUrl}/app/app.css`;
  const browser = await chromium.launch();

  for (const variant of ['e2', 'e2f', 'e3'] as const) {
    const html = pageDocument(await emailHtml(variant), cssHref, baseUrl);
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(html, { waitUntil: 'networkidle' });
      await page.screenshot({
        path: path.join(OUT, `${variant}-${phase}-${width}.png`),
        fullPage: true,
      });
      await page.close();
    }
  }

  await browser.close();
  const indexPath = path.join(OUT, 'INDEX.txt');
  const lines = [
    `# Admin copy layout polish evidence (${phase})`,
    '',
    ...(['e2', 'e2f', 'e3'] as const).flatMap((v) =>
      widths.map((w) => `- ${v}-${phase}-${w}.png — pass1 ${v.toUpperCase()} at ${w}px`)
    ),
    '',
  ];
  await writeFile(indexPath, lines.join('\n'), { flag: 'a' });
  console.log(`Wrote ${phase} evidence to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
