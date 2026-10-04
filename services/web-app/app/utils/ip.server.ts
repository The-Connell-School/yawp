import { createHash } from 'node:crypto';

// CloudFront-aware client IP extraction.
// X-Forwarded-For: client, proxy1, proxy2, ... , cloudfront-edge
// We want the real client address, which is the second-from-last entry when present.
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 2]!;
    if (parts.length === 1) return parts[0]!;
  }
  // Common alternates
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

export function ipHash(ip: string): string {
  // Non-reversible fingerprint for per-IP bucket keys and logs. A 32-bit
  // rolling hash collides far too easily to key a rate limiter on.
  return createHash('sha256').update(ip).digest('hex').slice(0, 24);
}
