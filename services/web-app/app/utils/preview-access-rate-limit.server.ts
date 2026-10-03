import { createHash } from 'node:crypto';

const WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const PER_CLIENT_LIMIT = 10;
const GLOBAL_LIMIT = 100;

type AttemptBucket = {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
};

const buckets = new Map<string, AttemptBucket>();

// CloudFront sets X-Forwarded-For as: client, ... , CloudFront edge
// The real client is the second-from-last entry.
function extractClientIpBehindCloudFront(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const addresses = forwarded.split(',').map((value) => value.trim());
    if (addresses.length >= 2) {
      return addresses.at(-2) || 'unknown';
    }
    return addresses[0] || 'unknown';
  }
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

function clientKey(request: Request) {
  return `client:${createHash('sha256')
    .update(extractClientIpBehindCloudFront(request))
    .digest('hex')
    .slice(0, 24)}`;
}

function currentBucket(key: string, now: number) {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStartedAt >= WINDOW_MS) {
    const reset = { failures: 0, windowStartedAt: now, blockedUntil: 0 };
    buckets.set(key, reset);
    return reset;
  }
  return bucket;
}

function retryAfterSeconds(bucket: AttemptBucket, now: number) {
  return Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000));
}

export function checkPreviewAccessAttempt(
  request: Request,
  now = Date.now()
) {
  const client = currentBucket(clientKey(request), now);
  const global = currentBucket('global', now);
  const blocked = [client, global].filter(
    (bucket) => bucket.blockedUntil > now
  );
  return blocked.length === 0
    ? { allowed: true as const, retryAfter: 0 }
    : {
        allowed: false as const,
        retryAfter: Math.max(
          ...blocked.map((bucket) => retryAfterSeconds(bucket, now))
        ),
      };
}

export function recordFailedPreviewAccessAttempt(
  request: Request,
  now = Date.now()
) {
  const entries = [
    { key: clientKey(request), limit: PER_CLIENT_LIMIT },
    { key: 'global', limit: GLOBAL_LIMIT },
  ];
  for (const { key, limit } of entries) {
    const bucket = currentBucket(key, now);
    bucket.failures += 1;
    if (bucket.failures >= limit) bucket.blockedUntil = now + BLOCK_MS;
  }

  // Record only an irreversible client fingerprint. Never log the attempted code.
  console.warn(
    JSON.stringify({
      event: 'preview_access_failed',
      client: clientKey(request).slice('client:'.length),
    })
  );
}

export function clearFailedPreviewAccessAttempts(request: Request) {
  buckets.delete(clientKey(request));
}

export function resetPreviewAccessRateLimitForTests() {
  buckets.clear();
}
