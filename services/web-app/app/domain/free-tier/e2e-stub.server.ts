/** Local demo-only stubs for Playwright evidence (never enabled in production). */

export function yawpE2eStubAllowed() {
  const origin = process.env.PRIMARY_APP_URL ?? '';
  return (
    process.env.YAWP_ENVIRONMENT === 'demo' &&
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)
  );
}

export function readYawpE2eStub(request: Request): string | null {
  if (!yawpE2eStubAllowed()) return null;
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)yawp_e2e_stub=([^;]+)/);
  const value = match?.[1] ? decodeURIComponent(match[1]) : null;
  if (!value || value === 'clear') return null;
  return value;
}

export async function applyYawpE2eDenyStub(request: Request): Promise<
  { ok: false; reason: 'unavailable' } | null
> {
  const stub = readYawpE2eStub(request);
  if (stub === 'deny-unavailable') return { ok: false, reason: 'unavailable' };
  if (stub === 'deny-delay') {
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return null;
}

export function yawpE2eForwardShouldFail(request: Request) {
  return readYawpE2eStub(request) === 'forward-unavailable';
}
