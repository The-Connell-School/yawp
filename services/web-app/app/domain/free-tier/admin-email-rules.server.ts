import { normalizeEmail } from './service.server';
import { isConsumerEmailDomain } from './consumer-email-domains';
import { mailboxIdentity } from './admin-email';
export { mailboxIdentity } from './admin-email';

export function emailDomain(email: string) {
  const at = normalizeEmail(email).lastIndexOf('@');
  if (at < 0) return '';
  return normalizeEmail(email).slice(at + 1);
}

export type AdminEmailCheckResult =
  | { ok: true; manualReview: false }
  | { ok: true; manualReview: true; reason: 'consumer_domain' | 'domain_mismatch' | 'same_as_teacher' };

export function evaluateAdminEmail(args: {
  teacherEmail: string;
  adminEmail: string;
  schoolName?: string;
}): AdminEmailCheckResult {
  const teacherMailbox = mailboxIdentity(args.teacherEmail);
  const adminMailbox = mailboxIdentity(args.adminEmail);
  if (teacherMailbox === adminMailbox) {
    return { ok: true, manualReview: true, reason: 'same_as_teacher' };
  }

  const adminDomain = emailDomain(args.adminEmail);
  const teacherDomain = emailDomain(args.teacherEmail);

  if (isConsumerEmailDomain(adminDomain)) {
    return { ok: true, manualReview: true, reason: 'consumer_domain' };
  }

  if (teacherDomain && adminDomain && teacherDomain !== adminDomain) {
    return { ok: true, manualReview: true, reason: 'domain_mismatch' };
  }

  return { ok: true, manualReview: false };
}

/**
 * Demo sends every approval request straight to the named administrator
 * (the teacher is BCC'd), so manual-review holds never apply there.
 */
export function evaluateAdminEmailForRuntime(
  args: { teacherEmail: string; adminEmail: string; schoolName?: string },
  runtimeEnvironment: string
): AdminEmailCheckResult {
  if (runtimeEnvironment === 'demo') {
    return { ok: true, manualReview: false };
  }
  return evaluateAdminEmail(args);
}

export const ADMIN_REDIRECT_CHAIN_CAP = 3;
