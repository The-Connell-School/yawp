// Local browser instrumentation observes the existing accepted capture branch.
// It never changes delivery decisions and is not loaded by deployed builds.
import { mergeConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import base from '../vite.config';
const database = new URL(process.env.E2E_DATABASE_URL || '');
const capture = process.env.SIGNON_RESEND_CAPTURE_DIR || '';
if (
  process.env.SIGNON_LOCAL_TEST !== '1' ||
  !['127.0.0.1', 'localhost'].includes(database.hostname) ||
  !process.env.TMPDIR ||
  !path
    .resolve(capture)
    .startsWith(path.resolve(process.env.TMPDIR) + path.sep) ||
  process.env.SIGNON_MAIL_CAPTURE_DIR ||
  process.env.EMAIL_PROVIDER ||
  process.env.RESEND_API_KEY
)
  throw new Error('Provider-free isolated local resend fixture required');
fs.mkdirSync(capture, { recursive: true, mode: 0o700 });
// The actual Prisma connection stays on E2E_DATABASE_URL. Only deployment metadata
// is simulated, matching the real-DB preview OTP regression convention.
process.env.DATABASE_URL =
  'postgresql://yawp_pr_565_app:fixture-password@preview-postgres:5432/yawp_pr_565';
process.env.YAWP_ENVIRONMENT = 'preview';
process.env.PREVIEW_SLUG = 'pr-565';
process.env.PREVIEW_DATA_MODE = 'seed';
delete process.env.DATABASE_SCHEMA;
export default mergeConfig(base, {
  plugins: [
    {
      name: 'private-resend-capture-observer',
      enforce: 'pre',
      transform(source: string, id: string) {
        if (!id.endsWith('/app/utils/email.server.ts')) return;
        return source
          .replace(
            'JSON.stringify({ to: email.to, subject: email.subject })',
            "'[private capture metadata omitted]'"
          )
          .replace(
            "if (getEmailProvider() === 'ses') {",
            "if (getEmailProvider() === 'ses') { throw new Error('Real email providers forbidden in local QA');"
          )
          .replace(
            "const response = await fetch('https://api.resend.com/emails', {",
            "throw new Error('Real email providers forbidden in local QA'); const response = await fetch('https://api.resend.com/emails', {"
          )
          .replace(
            'if (shouldUsePreviewEmailCapture()) {',
            `if (shouldUsePreviewEmailCapture()) {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        await fs.writeFile(path.join(${JSON.stringify(capture)}, crypto.randomUUID() + '.json'), JSON.stringify(email), { mode: 0o600 });`
          );
      },
    },
  ],
});
