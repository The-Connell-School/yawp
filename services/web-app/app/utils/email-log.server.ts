import { redactEmailForLog } from './redact-email-for-log.server';
import { shouldUsePreviewEmailCapture } from './preview-email-capture.server';

type EmailLogPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export function canLogFullEmailBody(): boolean {
  if (process.env.NODE_ENV !== 'development') {
    return false;
  }
  if (process.env.EMAIL_LOG_BODY !== '1') {
    return false;
  }

  const yawpEnvironment = process.env.YAWP_ENVIRONMENT?.toLowerCase();
  if (
    yawpEnvironment === 'preview' ||
    yawpEnvironment === 'production' ||
    yawpEnvironment === 'demo'
  ) {
    return false;
  }

  if (shouldUsePreviewEmailCapture()) {
    return false;
  }

  return true;
}

export function buildSafeEmailLogSummary(
  email: EmailLogPayload,
  logMeta?: { kind?: string }
) {
  const bodyLength = Math.max(email.text?.length ?? 0, email.html?.length ?? 0);
  return {
    to: redactEmailForLog(email.to),
    ...(logMeta?.kind ? { kind: logMeta.kind } : {}),
    bodyLength,
  };
}
