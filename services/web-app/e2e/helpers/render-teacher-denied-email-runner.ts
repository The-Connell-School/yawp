/**
 * Playwright runs in Node; render deny email HTML in an isolated Bun process.
 */
import { buildTeacherDeniedDesignedEmail } from '~/emails/build-free-tier-emails.server';

const raw = process.argv[2];
if (!raw) {
  console.error('Usage: bun render-teacher-denied-email-runner.ts <json>');
  process.exit(1);
}

const args = JSON.parse(raw) as Parameters<typeof buildTeacherDeniedDesignedEmail>[0];
const email = await buildTeacherDeniedDesignedEmail(args);
console.log(JSON.stringify({ subject: email.subject, html: email.html }));
