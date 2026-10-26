/** Preview ingress terminates TLS, preserves Host and overwrites forwarding
 * headers. The fast Vite/node-fetch-server adapter still uses the HTTP socket
 * protocol. Recover HTTPS only from deployment configuration for that exact
 * request host; never authorize an Origin from client-supplied proxy headers.
 */
export function signonRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  if (
    process.env.YAWP_ENVIRONMENT === 'preview' &&
    url.protocol === 'http:' &&
    process.env.PRIMARY_APP_URL
  ) {
    try {
      const configured = new URL(process.env.PRIMARY_APP_URL);
      if (
        configured.protocol === 'https:' &&
        !configured.username &&
        !configured.password &&
        configured.host === url.host
      )
        return configured.origin;
    } catch {
      // Invalid deployment configuration must not expand accepted origins.
    }
  }
  return url.origin;
}
