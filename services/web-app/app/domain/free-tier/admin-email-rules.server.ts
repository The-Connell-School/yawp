import { normalizeEmail } from './service.server';
import { isConsumerEmailDomain } from './consumer-email-domains';

export function emailDomain(email: string) {
  const at = normalizeEmail(email).lastIndexOf('@');
  if (at < 0) return '';
  return normalizeEmail(email).slice(at + 1);
}

/** Gmail-style mailbox identity for self-approval and plus-tag detection. */
export function mailboxIdentity(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at < 0) return normalized;
  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') {
    local = local.replace(/\./g, '');
  }
  return `${local}@${domain}`;
}

export type AdminEmailCheckResult =
  | { ok: true; manualReview: false }
  | { ok: true; manualReview: true; reason: 'consumer_domain' | 'domain_mismatch' | 'same_as_teacher' }
  | { ok: false; reason: 'same_as_teacher' };

export function evaluateAdminEmail(args: {
  teacherEmail: string;
  adminEmail: string;
  schoolName?: string;
}): AdminEmailCheckResult {
  const teacherMailbox = mailboxIdentity(args.teacherEmail);
  const adminMailbox = mailboxIdentity(args.adminEmail);
  if (teacherMailbox === adminMailbox) return { ok: false, reason: 'same_as_teacher' };

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

export const ADMIN_REDIRECT_CHAIN_CAP = 3;
