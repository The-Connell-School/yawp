import { getDomainUrl } from '../misc.tsx';

function trimSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function getPlatformBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = String(env.BLACKBOARD_LTI_MOCK_URL || '').trim();
  if (!url) {
    // Default for local tests when worktree setup hasn't populated env yet.
    return 'http://127.0.0.1:9473';
  }
  return trimSlash(url);
}

export function getPlatformOidcAuthUrl(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
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
  env: NodeJS.ProcessEnv = process.env
): string {
  const base = new URL(getDomainUrl(request));
  base.pathname = '/dev/blackboard-lti-mock/api/v1/lti/deep-linking';
  base.search = '';
  return base.toString();
}

export function getPlatformJwksUrl(
  clientId: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return `${getPlatformBaseUrl(env)}/api/v1/management/applications/${encodeURIComponent(
    clientId
  )}/jwks.json`;
}

