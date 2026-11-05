import { afterEach, describe, expect, test } from 'bun:test';
import {
  adaptPreviewIngressRequest,
  signonRequestOrigin,
} from './origin.server';

const saved = {
  YAWP_ENVIRONMENT: process.env.YAWP_ENVIRONMENT,
  PRIMARY_APP_URL: process.env.PRIMARY_APP_URL,
};

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function proxyPost(path: string, origin: string | null) {
  const headers: Record<string, string> = {
    host: 'pr-848.preview.yawp.school',
    'x-forwarded-host': 'pr-848.preview.yawp.school',
    'x-forwarded-proto': 'https',
  };
  if (origin !== null) headers.Origin = origin;
  return new Request(`http://pr-848.preview.yawp.school${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ code: 'yawp-rocks', returnTo: '/' }),
  });
}

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

describe('signonRequestOrigin', () => {
  test('recovers HTTPS from PRIMARY_APP_URL for preview HTTP adapter URLs', () => {
    process.env.YAWP_ENVIRONMENT = 'preview';
    process.env.PRIMARY_APP_URL = 'https://pr-848.preview.yawp.school';
    const request = proxyPost('/auth/preview-access', null);
    expect(signonRequestOrigin(request)).toBe(
      'https://pr-848.preview.yawp.school'
    );
  });
});

describe('adaptPreviewIngressRequest', () => {
  test('rewrites preview adapter URLs to configured HTTPS for CSRF alignment', () => {
    process.env.YAWP_ENVIRONMENT = 'preview';
    process.env.PRIMARY_APP_URL = 'https://pr-848.preview.yawp.school';
    const request = proxyPost('/auth/preview-access.data', 'https://pr-848.preview.yawp.school');
    const adapted = adaptPreviewIngressRequest(request);
    expect(new URL(adapted.url).origin).toBe('https://pr-848.preview.yawp.school');
    expect(adapted.headers.get('Origin')).toBe(
      'https://pr-848.preview.yawp.school'
    );
    expect(
      csrfWouldReject(adapted, ['yawp.school', '*.yawp.school'])
    ).toBe(false);
    expect(csrfWouldReject(request, ['yawp.school', '*.yawp.school'])).toBe(
      true
    );
  });

  test('leaves direct same-origin requests unchanged outside preview', () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    process.env.PRIMARY_APP_URL = 'https://yawp.school';
    const request = new Request('https://yawp.school/auth/login', {
      method: 'POST',
      headers: { Origin: 'https://yawp.school' },
      body: new URLSearchParams({ intent: 'resolve' }),
    });
    expect(adaptPreviewIngressRequest(request)).toBe(request);
  });

  test('does not rewrite when PRIMARY_APP_URL host differs from the request host', () => {
    process.env.YAWP_ENVIRONMENT = 'preview';
    process.env.PRIMARY_APP_URL = 'https://pr-566.preview.yawp.school';
    const request = proxyPost('/auth/login.data', 'https://pr-848.preview.yawp.school');
    expect(adaptPreviewIngressRequest(request)).toBe(request);
  });

  for (const configured of [
    undefined,
    'broken',
    'http://pr-848.preview.yawp.school',
    'https://user:pass@pr-848.preview.yawp.school',
    'https://evil.example',
  ]) {
    test(`does not rewrite for invalid deployment URL: ${configured}`, () => {
      process.env.YAWP_ENVIRONMENT = 'preview';
      if (configured === undefined) delete process.env.PRIMARY_APP_URL;
      else process.env.PRIMARY_APP_URL = configured;
      const request = proxyPost('/auth/login.data', 'https://pr-848.preview.yawp.school');
      expect(adaptPreviewIngressRequest(request)).toBe(request);
    });
  }
});
