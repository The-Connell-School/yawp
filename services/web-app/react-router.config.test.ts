import { describe, expect, test } from 'bun:test';
import { yawpBrowserActionOrigins } from './react-router.config';

/** Mirrors React Router `throwIfPotentialCSRFAttack` origin matching. */
function csrfWouldReject(
  request: Request,
  allowedActionOrigins: string[] = []
) {
  const originHeader = request.headers.get('origin');
  if (!originHeader || originHeader === 'null') return false;
  let originUrl: URL;
  try {
    originUrl = new URL(originHeader);
  } catch {
    return true;
  }
  const requestUrl = new URL(request.url);
  if (originUrl.origin === requestUrl.origin) return false;
  return !allowedActionOrigins.some(
    (pattern) =>
      pattern === originUrl.host ||
      matchWildcardDomain(originUrl.host, pattern)
  );
}

function matchWildcardDomain(domain: string, pattern: string) {
  const domainParts = domain.split('.');
  const patternParts = pattern.split('.');
  if (patternParts.length < 1 || domainParts.length < patternParts.length)
    return false;
  while (patternParts.length) {
    const patternPart = patternParts.pop();
    const domainPart = domainParts.pop();
    switch (patternPart) {
      case '':
        return false;
      case '*':
        if (domainPart) continue;
        return false;
      case '**':
        return patternParts.length === 0 && domainPart !== undefined;
      default:
        if (domainPart !== patternPart) return false;
    }
  }
  return domainParts.length === 0;
}

function previewHttpsPost(host: string, path: string) {
  return new Request(`http://${host}${path}`, {
    method: 'POST',
    headers: {
      host,
      Origin: `https://${host}`,
    },
    body: new URLSearchParams({ code: 'yawp-rocks' }),
  });
}

describe('yawpBrowserActionOrigins', () => {
  test('production allowlist omits preview-only wildcard', () => {
    const origins = yawpBrowserActionOrigins({ YAWP_ENVIRONMENT: 'production' });
    expect(origins).toContain('yawp.school');
    expect(origins).toContain('*.yawp.school');
    expect(origins).not.toContain('*.preview.yawp.school');
  });

  test('preview allowlist accepts HTTPS browser Origins on PR preview hosts', () => {
    const allowed = yawpBrowserActionOrigins({ YAWP_ENVIRONMENT: 'preview' });
    expect(allowed).toContain('*.preview.yawp.school');

    for (const host of [
      'pr-123.preview.yawp.school',
      'ua-pr-456.preview.yawp.school',
    ]) {
      const request = previewHttpsPost(host, '/auth/login');
      expect(csrfWouldReject(request, allowed)).toBe(false);
    }
  });

  test('preview allowlist still rejects unrelated Origins', () => {
    const allowed = yawpBrowserActionOrigins({ YAWP_ENVIRONMENT: 'preview' });
    const request = new Request('http://pr-123.preview.yawp.school/auth/login', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
      body: new URLSearchParams(),
    });
    expect(csrfWouldReject(request, allowed)).toBe(true);
  });

  test('legacy single-label wildcard does not cover nested preview hostnames', () => {
    const productionOnly = yawpBrowserActionOrigins({
      YAWP_ENVIRONMENT: 'production',
    });
    const request = previewHttpsPost(
      'pr-867.preview.yawp.school',
      '/auth/preview-access'
    );
    expect(csrfWouldReject(request, productionOnly)).toBe(true);
  });
});
