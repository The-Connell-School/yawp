import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sendEmail } from '~/utils/email.server';
import { FlowError, opaque } from './flow.server';
import { capturePreviewCode } from './preview-code.server';

/** Capture before the provider abstraction can log or send a code. */
export async function deliverCode(email: string, code: string) {
  // The shared renderer also calls the hosted demo environment "preview".
  // Preserve its existing delivery path and reserve capture for isolated PRs.
  if (process.env.YAWP_ENVIRONMENT === 'preview' && process.env.PREVIEW_SLUG !== 'demo') {
    if (capturePreviewCode(email, code)) return;
    throw new FlowError("We couldn't send the email. Try again in a moment.", 503);
  }
  const capture = process.env.SIGNON_MAIL_CAPTURE_DIR;
  const db = new URL(process.env.DATABASE_URL!);
  if (
    process.env.NODE_ENV !== 'production' ||
    ['127.0.0.1', 'localhost'].includes(db.hostname)
  ) {
    if (
      process.env.NODE_ENV === 'production' ||
      !['127.0.0.1', 'localhost'].includes(db.hostname)
    )
      throw new FlowError(
        "We couldn't send the email. Try again in a moment.",
        503
      );
    const tmp = process.env.TMPDIR;
    if (
      !capture ||
      !tmp ||
      !path.resolve(capture).startsWith(path.resolve(tmp) + path.sep)
    )
      throw new FlowError(
        "We couldn't send the email. Try again in a moment.",
        503
      );
    await mkdir(capture, { recursive: true, mode: 0o700 });
    await writeFile(
      path.join(capture, opaque() + '.json'),
      JSON.stringify({ email, code }),
      { mode: 0o600 }
    );
    return;
  }
  if (
    !(
      process.env.EMAIL_PROVIDER === 'ses' ||
      process.env.EMAIL_PROVIDER === 'aws-ses' ||
      process.env.RESEND_API_KEY
    )
  )
    throw new FlowError(
      "We couldn't send the email. Try again in a moment.",
      503
    );
  const result = await sendEmail({
    to: email,
    subject: 'Your Yawp! sign-in code',
    text: `Your code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
  });
  if (result.status !== 'success')
    throw new FlowError(
      "We couldn't send the email. Try again in a moment.",
      503
    );
}
