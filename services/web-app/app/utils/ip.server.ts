import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { CLOUDFRONT_IPV4_RANGES } from './cloudfront-ranges.server';

// Production path: viewer -> CloudFront -> App Runner (Envoy) -> app.
//   CloudFront appends the viewer's address to whatever X-Forwarded-For the
//   client sent; App Runner's Envoy appends the address it saw (a CloudFront
//   edge, or the real caller if the public App Runner URL is hit directly).
// Everything to the LEFT of the first untrusted hop is client-controlled and
// can be forged. So we walk from the right, skip addresses that belong to
// CloudFront (the only proxy we trust), and take the first address that does
// not. That is the real viewer on the CloudFront path, the real caller when
// someone bypasses CloudFront, and it does not depend on whether Envoy appends.

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((n, octet) => n * 256 + Number(octet), 0);
}

const CLOUDFRONT_BLOCKS = CLOUDFRONT_IPV4_RANGES.map((cidr) => {
  const [base, bits] = cidr.split('/');
  const size = 2 ** (32 - Number(bits));
  const start = Math.floor(ipv4ToInt(base!) / size) * size;
  return { start, end: start + size - 1 };
});

export function isCloudFrontEdgeIp(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const n = ipv4ToInt(ip);
  return CLOUDFRONT_BLOCKS.some((b) => n >= b.start && n <= b.end);
}

/** "1.2.3.4", "1.2.3.4:5678", "[2001:db8::1]:443", "2001:db8::1" -> bare address, or null. */
function normalizeHop(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) value = bracketed[1]!;
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) value = value.split(':')[0]!;
  return isIP(value) ? value.toLowerCase() : null;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) return 'unknown';
  const hops = forwarded.split(',');
  for (let i = hops.length - 1; i >= 0; i -= 1) {
    const ip = normalizeHop(hops[i]!);
    // A malformed hop means we cannot vouch for anything to its left.
    if (!ip) return 'unknown';
    if (!isCloudFrontEdgeIp(ip)) return ip;
  }
  return 'unknown';
}

export function ipHash(ip: string): string {
  // Non-reversible fingerprint for per-IP bucket keys and logs. A 32-bit
  // rolling hash collides far too easily to key a rate limiter on.
  return createHash('sha256').update(ip).digest('hex').slice(0, 24);
}
