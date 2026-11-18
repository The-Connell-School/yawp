import { yawpBrowserActionOrigins } from '../../../react-router.config';

/** TLS-terminating ingress (CloudFront, preview proxy) preserves the public Host
 * while the Node adapter often builds `request.url` from the HTTP socket and an
 * internal host. Recover the deployment-configured public HTTPS origin from
 * PRIMARY_APP_URL only; never authorize an Origin from client-supplied proxy
 * headers.
 *
 * Preview requires the request Host to match PRIMARY_APP_URL (per-preview host).
 * Production and other non-preview deployments accept the configured public
 * origin for HTTP adapter URLs even when the Host is an internal App Runner
 * name, so browser Origins like https://yawp.school align with sign-on checks
 * and Google redirect_uri construction.
 */
function configuredPublicOrigin(request: Request): URL | null {
  const url = new URL(request.url);
  if (!process.env.PRIMARY_APP_URL) return null;
  try {
    const configured = new URL(process.env.PRIMARY_APP_URL);
    if (
      configured.protocol !== 'https:' ||
      configured.username ||
      configured.password
    )
      return null;

    const isPreview =
      process.env.YAWP_ENVIRONMENT?.trim().toLowerCase() === 'preview';

    if (isPreview) {
      if (url.protocol !== 'http:' || configured.host !== url.host) return null;
      return configured;
    }

    if (url.protocol === 'http:') return configured;
    if (url.origin === configured.origin) return configured;
    return null;
  } catch {
    return null;
  }
}

export function signonRequestOrigin(request: Request): string {
  return configuredPublicOrigin(request)?.origin ?? new URL(request.url).origin;
}

/** Mirrors React Router `throwIfPotentialCSRFAttack` host matching. */
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

function originHostMatchesAllowlist(host: string) {
  return yawpBrowserActionOrigins().some(
    (pattern) =>
      pattern === host || matchWildcardDomain(host, pattern)
  );
}

function isLoopbackHostname(host: string) {
  const normalized = host.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized.endsWith('.localhost')
  );
}

/** Parse a canonical browser `Origin` header (scheme + host + port only). */
export function parseBrowserOriginHeader(value: string): string | null {
  try {
    const url = new URL(value);
    if (value !== url.origin) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Validates browser-submitted origins for unified sign-on POST actions.
 * Aligns with React Router `allowedActionOrigins`: missing/`null` Origin passes,
 * trusted Yawp hostnames (e.g. ua.yawp.school behind PRIMARY_APP_URL) pass even
 * when the adapter origin is the canonical deployment URL, and foreign sites fail.
 */
export function signonBrowserOriginAllowed(request: Request): boolean {
  const originHeader = request.headers.get('Origin');
  if (!originHeader || originHeader === 'null') return true;
  const browserOrigin = parseBrowserOriginHeader(originHeader);
  if (!browserOrigin) return false;
  let browserUrl: URL;
  try {
    browserUrl = new URL(browserOrigin);
  } catch {
    return false;
  }
  const expected = signonRequestOrigin(request);
  if (browserOrigin === expected) return true;
  const adapterOrigin = new URL(request.url).origin;
  if (browserOrigin === adapterOrigin) {
    return (
      browserUrl.protocol === 'https:' ||
      isLoopbackHostname(browserUrl.hostname)
    );
  }
  if (browserUrl.protocol !== 'https:') return false;
  if (!configuredPublicOrigin(request)) return false;
  const requestHost = new URL(request.url).hostname.toLowerCase();
  const browserHost = new URL(browserOrigin).hostname.toLowerCase();
  if (browserHost !== requestHost) return false;
  return originHostMatchesAllowlist(browserHost);
}

function previewConfiguredPublicOrigin(request: Request): URL | null {
  if (process.env.YAWP_ENVIRONMENT?.trim().toLowerCase() !== 'preview')
    return null;
  return configuredPublicOrigin(request);
}

/** Align `request.url` with the configured public HTTPS origin before React Router CSRF checks. */
export function adaptPreviewIngressRequest(request: Request): Request {
  const configured = previewConfiguredPublicOrigin(request);
  if (!configured) return request;
  const url = new URL(request.url);
  if (url.origin === configured.origin) return request;
  url.protocol = configured.protocol;
  url.host = configured.host;
  const init = {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: request.redirect,
    signal: request.signal,
    ...(request.body ? { duplex: 'half' as const } : {}),
  } satisfies RequestInit & { duplex?: 'half' };
  return new Request(url.toString(), init as RequestInit);
}
