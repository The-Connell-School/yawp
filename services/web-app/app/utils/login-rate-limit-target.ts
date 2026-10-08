import { createHash } from 'node:crypto';
import { parseLoginIdentifier } from './login-identifier';

/**
 * Canonical login identifier for rate-limit buckets and teacher unlock.
 * Always matches {@link parseLoginIdentifier} (email + handle rules).
 */
export function normalizeLoginRateLimitTargetKey(identifier: string): string {
  return parseLoginIdentifier(identifier).value;
}

export function hashLoginRateLimitTarget(identifier: string): string {
  return createHash('sha256')
    .update(normalizeLoginRateLimitTargetKey(identifier))
    .digest('hex')
    .slice(0, 32);
}
