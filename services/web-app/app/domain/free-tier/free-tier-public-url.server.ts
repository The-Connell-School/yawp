/** Canonical public origin for free-tier emails and signed links (never request host). */
export function freeTierPublicAppOrigin(): string {
  const raw = process.env.PRIMARY_APP_URL?.trim();
  if (!raw) {
    throw new Error('PRIMARY_APP_URL is required for free-tier links and email');
  }
  return raw.replace(/\/$/, '');
}
