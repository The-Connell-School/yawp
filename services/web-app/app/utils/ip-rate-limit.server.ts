import { createHash } from 'node:crypto';
import { getClientIpAddress } from './client-ip.server';

// Simple in-memory sliding window limiter. Per-process only.
const WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const PER_CLIENT_LIMIT = 10;
const GLOBAL_LIMIT = 200;

type Bucket = { failures: number; windowStartedAt: number; blockedUntil: number };
const buckets = new Map<string, Bucket>();

function keyFor(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}
function currentBucket(name: string, now: number) {
  const b = buckets.get(name);
  if (!b || now - b.windowStartedAt >= WINDOW_MS) {
    const reset = { failures: 0, windowStartedAt: now, blockedUntil: 0 };
    buckets.set(name, reset);
    return reset;
  }
  return b;
}
function retryAfter(bucket: Bucket, now: number) {
  return Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000));
}

export function rateLimitCheck(request: Request, now = Date.now()) {
  const client = currentBucket(`ip:${keyFor(getClientIpAddress(request))}`, now);
  const global = currentBucket('global', now);
  const blocked = [client, global].filter((b) => b.blockedUntil > now);
  if (blocked.length) {
    return {
      allowed: false as const,
      retryAfter: Math.max(...blocked.map((b) => retryAfter(b, now))),
    };
  }
  return { allowed: true as const, retryAfter: 0 };
}

export function rateLimitRecordFailure(request: Request, now = Date.now()) {
  const entries = [
    { name: `ip:${keyFor(getClientIpAddress(request))}`, limit: PER_CLIENT_LIMIT },
    { name: 'global', limit: GLOBAL_LIMIT },
  ];
  for (const { name, limit } of entries) {
    const b = currentBucket(name, now);
    b.failures += 1;
    if (b.failures >= limit) b.blockedUntil = now + BLOCK_MS;
  }
}

export function resetRateLimiterForTests() {
  buckets.clear();
}

