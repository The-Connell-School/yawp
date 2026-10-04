/**
 * Best-effort client IP extraction.
 * Note: This implementation uses the last X-Forwarded-For hop. PR #401 updates
 * the shared helper to use the second-from-last when behind a trusted proxy.
 */
export function getClientIpAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const addresses = forwarded.split(',').map((v) => v.trim());
    return addresses.at(-1) || 'unknown';
  }
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

