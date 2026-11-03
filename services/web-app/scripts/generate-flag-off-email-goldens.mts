/**
 * One-off: render flag-off admin approval emails at current code (must match main 7b203f73).
 * Usage: bun run scripts/generate-flag-off-email-goldens.mts [outDir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildDesignedAdminApprovalEmail } from '../app/domain/free-tier/admin-approval-email.server';
import { htmlForStoredAdminApprovalEmail } from '../app/domain/free-tier/admin-approval-email.server';
import { logScriptError } from '../app/utils/log-script-error.server';

const OUT =
  process.argv[2] ??
  path.join(
    import.meta.dirname,
    '../app/domain/free-tier/__goldens__/flag-off-main-7b203f73'
  );

const FIX = {
  teacherName: 'Jordan Rivera',
  schoolName: 'Lincoln High School',
  teacherEmail: 'jrivera@example.test',
  forwarder: 'Sam Chen',
  approveUrl: 'https://yawp.test/free/admin/approve?t=GOLDEN',
  notRightPersonUrl: 'https://yawp.test/free/admin/not-right-person?t=GOLDEN',
} as const;

process.env.PRIMARY_APP_URL = 'https://yawp.test';

async function writeScenario(
  name: string,
  designed: { subject: string; text: string; html: string }
) {
  const dir = path.join(OUT, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'subject.txt'), designed.subject);
  writeFileSync(path.join(dir, 'text.txt'), designed.text);
  writeFileSync(path.join(dir, 'html.txt'), designed.html);
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  await writeScenario(
    'first-request',
    await buildDesignedAdminApprovalEmail({
      ...FIX,
      pass1: false,
    })
  );

  await writeScenario(
    'reminder',
    await buildDesignedAdminApprovalEmail({
      ...FIX,
      reminder: true,
      pass1: false,
    })
  );

  const adminForward = await buildDesignedAdminApprovalEmail({
    ...FIX,
    forwardedByAdminName: FIX.forwarder,
    pass1: false,
  });
  await writeScenario('admin-forward', adminForward);

  await writeScenario('teacher-reroute', adminForward);

  const storedHtml = await htmlForStoredAdminApprovalEmail({
    subject: adminForward.subject,
    text: adminForward.text,
    teacherName: FIX.teacherName,
    teacherEmail: FIX.teacherEmail,
    schoolName: FIX.schoolName,
  });
  await writeScenario('stored-refresh', {
    subject: adminForward.subject,
    text: adminForward.text,
    html: storedHtml,
  });

  console.log(`Wrote goldens to ${OUT}`);
}

main().catch((e) => {
  logScriptError(e);
  process.exit(1);
});
