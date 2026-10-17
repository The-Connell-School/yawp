import { createHash } from 'node:crypto';
import { parseLoginIdentifier } from './login-identifier';

/**
 * Canonical login identifier for rate-limit buckets and teacher unlock.
 * Always matches {@link parseLoginIdentifier} (email + handle rules).
 */
export function normalizeLoginRateLimitTargetKey(identifier: string): string {
  return parseLoginIdentifier(identifier).value;
}

/** Shared by class sign-in and teacher password reset so both address the same buckets. */
export function classStudentLoginRateLimitTarget(
  classId: string,
  handle: string
): string {
  const normalized = handle
    .trim()
    .replace(/^@/, '')
    .slice(0, 100)
    .normalize('NFKC')
    .toLowerCase();
  return `${classId}:${normalized}`;
}

export function hashLoginRateLimitTarget(identifier: string): string {
  return createHash('sha256')
    .update(normalizeLoginRateLimitTargetKey(identifier))
    .digest('hex')
    .slice(0, 32);
}
