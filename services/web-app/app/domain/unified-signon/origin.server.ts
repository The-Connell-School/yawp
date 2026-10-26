/** Preview ingress terminates TLS, preserves Host and overwrites forwarding
 * headers. The fast Vite/node-fetch-server adapter still uses the HTTP socket
 * protocol. Recover HTTPS only from deployment configuration for that exact
 * request host; never authorize an Origin from client-supplied proxy headers.
 */
function previewConfiguredPublicOrigin(request: Request): URL | null {
  const url = new URL(request.url);
  if (
    process.env.YAWP_ENVIRONMENT !== 'preview' ||
    url.protocol !== 'http:' ||
    !process.env.PRIMARY_APP_URL
  )
    return null;
  try {
    const configured = new URL(process.env.PRIMARY_APP_URL);
    if (
      configured.protocol !== 'https:' ||
      configured.username ||
      configured.password ||
      configured.host !== url.host
    )
      return null;
    return configured;
  } catch {
    return null;
  }
}

export function signonRequestOrigin(request: Request): string {
  return previewConfiguredPublicOrigin(request)?.origin ?? new URL(request.url).origin;
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
