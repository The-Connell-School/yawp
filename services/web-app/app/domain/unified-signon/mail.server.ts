import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sendEmail } from '~/utils/email.server';
import { FlowError, opaque } from './flow.server';

/** Local delivery is captured before the provider abstraction can log or send it.
 * No capture files, endpoints or environment overrides exist on deployed hosts. */
export async function deliverCode(email: string, code: string) {
  const capture = process.env.SIGNON_MAIL_CAPTURE_DIR;
  const db = new URL(process.env.DATABASE_URL!);
  if (process.env.NODE_ENV !== 'production' && ['127.0.0.1', 'localhost'].includes(db.hostname)) {
    const tmp = process.env.TMPDIR;
    if (!capture || !tmp || !path.resolve(capture).startsWith(path.resolve(tmp) + path.sep)) throw new FlowError('Email delivery is unavailable.', 503);
    await mkdir(capture, { recursive: true, mode: 0o700 });
    await writeFile(path.join(capture, opaque() + '.json'), JSON.stringify({ email, code }), { mode: 0o600 });
    return;
  }
  if (!(process.env.EMAIL_PROVIDER === 'ses' || process.env.EMAIL_PROVIDER === 'aws-ses' || process.env.RESEND_API_KEY)) throw new FlowError('Email delivery is unavailable.', 503);
  const result = await sendEmail({ to: email, subject: 'Your Yawp sign-in code', text: `Your code is ${code}. It expires in 10 minutes.`, html: `<p>Your code is <strong>${code}</strong>. It expires in 10 minutes.</p>` });
  if (result.status !== 'success') throw new FlowError('Email delivery is unavailable. Please try again later.', 503);
}
