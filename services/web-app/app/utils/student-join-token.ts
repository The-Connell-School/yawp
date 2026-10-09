import { randomBytes } from 'node:crypto';

/** URL-safe join token for free-tier student onboarding (globally unique per class). */
export function generateStudentJoinToken(): string {
  return randomBytes(24).toString('base64url');
}
