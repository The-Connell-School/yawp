function previewOriginFromDatabaseUrl(): string | null {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;
  const match = databaseUrl.match(/\/yawp_([a-z0-9_]+)(?:\?|$)/i);
  if (!match?.[1]) return null;
  const slug = match[1].replace(/_/g, '-');
  const domain = process.env.PREVIEW_DOMAIN?.trim() || 'preview.yawp.school';
  return `https://${slug}.${domain}`;
}

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
    const fromDb = previewOriginFromDatabaseUrl();
    if (fromDb) return fromDb;
  }

  throw new Error('PRIMARY_APP_URL is required for free-tier links and email');
}
