import { freeTierPublicAppOrigin } from '~/domain/free-tier/free-tier-public-url.server';

/** Absolute origin for hosted email assets and footer links (never request host). */
export function transactionalEmailPublicOrigin(): string {
  try {
    return freeTierPublicAppOrigin();
  } catch {
    const primary = process.env.PRIMARY_APP_URL?.trim();
    if (primary) return primary.replace(/\/$/, '');
    return 'https://yawp.school';
  }
}

export function transactionalEmailLogoUrls(origin = transactionalEmailPublicOrigin()) {
  const base = origin.replace(/\/$/, '');
  return {
    black: `${base}/img/yawp_black_logo.png`,
    white: `${base}/img/yawp_white_logo.png`,
    site: `${base}`,
  };
}
