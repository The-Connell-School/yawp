import { normalizeEmail } from '~/utils/normalize-email';

/**
 * Temporary production hotfix: hide Teacher's Lounge in app nav and redirect
 * `/app/teacher-trainings` routes to the teacher dashboard. Remove this guard
 * and restore sidebar visibility to re-enable the Lounge.
 */
export const TEACHER_LOUNGE_TEMPORARILY_DISABLED = true;

/** Teachers who keep Lounge access while the global disable flag is on. */
export const TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS = [
  'zestlan.simmons@mps.k12.al.us',
  'eric@theconnellschool.com',
  'christhewriter@mail.com',
] as const;

export const TEACHER_LOUNGE_DISABLED_HOME = '/app';

const allowlistedEmails = new Set(
  TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS.map((email) => normalizeEmail(email))
);

export function isTeacherLoungeAllowlistedEmail(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  return allowlistedEmails.has(normalizeEmail(email));
}

export function isTeacherLoungeTemporarilyDisabledForUser({
  email,
}: {
  email: string | null | undefined;
}): boolean {
  if (!TEACHER_LOUNGE_TEMPORARILY_DISABLED) return false;
  return !isTeacherLoungeAllowlistedEmail(email);
}
