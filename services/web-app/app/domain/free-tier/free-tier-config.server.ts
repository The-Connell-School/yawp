import { isFreeTierLinkSigningConfigured } from './signed-link.server';

export class FreeTierConfigError extends Error {
  readonly code: 'missing_hmac_secret' | 'missing_primary_app_url';

  constructor(code: FreeTierConfigError['code'], message: string) {
    super(message);
    this.name = 'FreeTierConfigError';
    this.code = code;
  }
}

/** Fail closed before minting links or sending emails that embed signed URLs. */
export function assertFreeTierRuntimeConfigured() {
  if (!isFreeTierLinkSigningConfigured()) {
    throw new FreeTierConfigError(
      'missing_hmac_secret',
      'FREE_TIER_LINK_HMAC_SECRET is not configured. Free-tier signed links are disabled.'
    );
  }
  const primary = process.env.PRIMARY_APP_URL?.trim();
  const previewOk =
    process.env.YAWP_ENVIRONMENT === 'preview' &&
    (Boolean(process.env.PREVIEW_SLUG?.trim() && process.env.PREVIEW_DOMAIN?.trim()) ||
      Boolean(process.env.DATABASE_URL?.includes('/yawp_pr_')));
  if (!primary && !previewOk) {
    throw new FreeTierConfigError(
      'missing_primary_app_url',
      'PRIMARY_APP_URL is required for free-tier links and email.'
    );
  }
}

export function freeTierConfigErrorMessage(error: unknown) {
  if (error instanceof FreeTierConfigError) return error.message;
  if (error instanceof Error && error.message.includes('PRIMARY_APP_URL')) {
    return error.message;
  }
  if (error instanceof Error && error.message.includes('FREE_TIER_LINK_HMAC_SECRET')) {
    return error.message;
  }
  return 'Free-tier links are temporarily unavailable. Please contact support@yawp.school.';
}
