/** Canonical public origin for free-tier emails and signed links (never request host). */
export function freeTierPublicAppOrigin(): string {
  const primary = process.env.PRIMARY_APP_URL?.trim();
  if (primary) return primary.replace(/\/$/, '');

  if (process.env.YAWP_ENVIRONMENT === 'preview') {
    const slug = process.env.PREVIEW_SLUG?.trim();
    const domain = process.env.PREVIEW_DOMAIN?.trim();
    if (slug && domain) {
      return `https://${slug}.${domain}`.replace(/\/$/, '');
    }
  }

  throw new Error('PRIMARY_APP_URL is required for free-tier links and email');
}
