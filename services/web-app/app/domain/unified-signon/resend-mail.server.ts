import { shouldUsePreviewEmailCapture } from '~/utils/preview-email-capture.server';
import { assertPreviewSignonTarget } from '~/utils/preview-signon-target.server';
import { FlowError } from './flow.server';

/** Admit only the existing safe delivery path; never select a real provider. */
export function assertResendMailAvailable() {
  const unavailable = () => {
    throw new FlowError('Email delivery is unavailable.', 503);
  };
  // Demo shares the preview renderer but retains its existing delivery behavior.
  if (
    process.env.YAWP_ENVIRONMENT?.trim().toLowerCase() === 'preview' &&
    process.env.PREVIEW_SLUG !== 'demo'
  ) {
    try {
      const target = assertPreviewSignonTarget()!;
      const url = new URL(process.env.DATABASE_URL!);
      const provider = process.env.EMAIL_PROVIDER?.toLowerCase();
      if (
        url.href !== process.env.DATABASE_URL ||
        !/^yawp_pr_[1-9][0-9]*$/.test(target.database) ||
        url.hostname !== 'preview-postgres' ||
        url.port !== '5432' ||
        !/^[A-Za-z0-9_-]+$/.test(url.password) ||
        (provider && provider !== 'resend') ||
        !shouldUsePreviewEmailCapture()
      )
        unavailable();
    } catch {
      unavailable();
    }
    return;
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    !process.env.SIGNON_MAIL_CAPTURE_DIR
  )
    unavailable();
}
