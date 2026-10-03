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
  // A short, non-reversible fingerprint suitable for logs and per-IP keys.
  // Keep it short to avoid bloating log rows.
  // We deliberately avoid bringing in a crypto dependency here; DB-side logs can HMAC if needed.
  let hash = 0;
  for (let i = 0; i < ip.length; i += 1) {
    // Simple 32-bit rolling hash
    hash = (hash * 31 + ip.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

