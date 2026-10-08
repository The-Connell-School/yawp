/** Common consumer domains — not treated as school-teacher domain collisions. */
export const FREE_TIER_CONSUMER_EMAIL_DOMAINS = new Set(
  [
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'icloud.com',
    'me.com',
    'aol.com',
    'proton.me',
    'protonmail.com',
    'msn.com',
  ].map((d) => d.toLowerCase())
);

export function isConsumerEmailDomain(domain: string | null | undefined) {
  if (!domain) return false;
  return FREE_TIER_CONSUMER_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}
