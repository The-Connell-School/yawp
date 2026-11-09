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
