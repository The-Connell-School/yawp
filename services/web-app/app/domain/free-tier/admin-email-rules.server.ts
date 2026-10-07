import { normalizeEmail } from './service.server';

const CONSUMER_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'msn.com',
]);

export function emailDomain(email: string) {
  const at = normalizeEmail(email).lastIndexOf('@');
  if (at < 0) return '';
  return normalizeEmail(email).slice(at + 1);
}

export function isConsumerEmailDomain(domain: string) {
  return CONSUMER_EMAIL_DOMAINS.has(domain.toLowerCase());
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
  const teacher = normalizeEmail(args.teacherEmail);
  const admin = normalizeEmail(args.adminEmail);
  if (teacher === admin) return { ok: false, reason: 'same_as_teacher' };

  const adminDomain = emailDomain(admin);
  const teacherDomain = emailDomain(teacher);

  if (isConsumerEmailDomain(adminDomain)) {
    return { ok: true, manualReview: true, reason: 'consumer_domain' };
  }

  if (teacherDomain && adminDomain && teacherDomain !== adminDomain) {
    return { ok: true, manualReview: true, reason: 'domain_mismatch' };
  }

  return { ok: true, manualReview: false };
}

export const ADMIN_REDIRECT_CHAIN_CAP = 3;
