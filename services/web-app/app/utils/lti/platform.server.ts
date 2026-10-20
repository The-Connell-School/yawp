import { getDomainUrl } from '../misc.tsx';

const BLACKBOARD_ISSUER = 'https://blackboard.com';

function trimSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export type ConfiguredLtiPlatform = {
  id: string;
  issuer: string;
  clientId: string;
  jwksUrl: string;
  source: 'blackboard-lti-mock';
};

/**
 * Matches App Runner production (NODE_ENV=production, YAWP_ENVIRONMENT often unset)
 * and preview/demo containers (YAWP_ENVIRONMENT=preview|demo under NODE_ENV=production).
 */
export function isYawpProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const yawp = String(env.YAWP_ENVIRONMENT || '').trim().toLowerCase();
  if (yawp === 'production') return true;
  if (yawp === 'preview' || yawp === 'demo') return false;
  if (env.NODE_ENV === 'production') return true;
  return false;
}

export function isBlackboardLtiMockVerificationEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const url = String(env.BLACKBOARD_LTI_MOCK_URL || '').trim();
  if (!url) return false;
  if (isYawpProductionEnvironment(env)) return false;
  return true;
}

export function getPlatformBaseUrl(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const url = String(env.BLACKBOARD_LTI_MOCK_URL || '').trim();
  if (!url) return null;
  return trimSlash(url);
}

export function getPlatformOidcAuthUrl(
  request: Request,
  _env: NodeJS.ProcessEnv = process.env
): string {
  // Always prefer the same-origin proxy so HTTPS previews avoid mixed content,
  // and the preview access gate remains enforced.
  const base = new URL(getDomainUrl(request));
  base.pathname = '/dev/blackboard-lti-mock/api/v1/gateway/oidcauth';
  base.search = '';
  return base.toString();
}

export function getPlatformDeepLinkReturnUrl(
  request: Request,
  _env: NodeJS.ProcessEnv = process.env
): string {
  const base = new URL(getDomainUrl(request));
  base.pathname = '/dev/blackboard-lti-mock/api/v1/lti/deep-linking';
  base.search = '';
  return base.toString();
}

export function getPlatformJwksUrl(
  clientId: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const base = getPlatformBaseUrl(env);
  if (!base) return null;
  return `${base}/api/v1/management/applications/${encodeURIComponent(
    clientId
  )}/jwks.json`;
}

export function getConfiguredLtiPlatforms(
  env: NodeJS.ProcessEnv = process.env
): ConfiguredLtiPlatform[] {
  if (!isBlackboardLtiMockVerificationEnabled(env)) return [];
  const clientId = String(env.LTI_CLIENT_ID || 'yawp-blackboard-mock').trim();
  const jwksUrl = getPlatformJwksUrl(clientId, env);
  if (!jwksUrl) return [];
  return [
    {
      id: 'blackboard-lti-mock',
      issuer: BLACKBOARD_ISSUER,
      clientId,
      jwksUrl,
      source: 'blackboard-lti-mock',
    },
  ];
}

export function resolveLtiLaunchPlatform(
  clientIdHint: string,
  env: NodeJS.ProcessEnv = process.env
): ConfiguredLtiPlatform | null {
  const platforms = getConfiguredLtiPlatforms(env);
  if (platforms.length === 0) return null;
  const hint = clientIdHint.trim();
  if (hint) {
    return platforms.find((p) => p.clientId === hint) ?? platforms[0] ?? null;
  }
  return platforms[0] ?? null;
}

export { BLACKBOARD_ISSUER };
