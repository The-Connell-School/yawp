import { isBlackboardLtiMockUiEnabled } from '../blackboard-lti-mock-ui.server';

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
  // Prefer same-origin proxy in dev/preview so the access gate remains enforced.
  if (isBlackboardLtiMockUiEnabled(env)) {
    const proxyBase = new URL(request.url);
    proxyBase.pathname = '/dev/blackboard-lti-mock/api/v1/gateway/oidcauth';
    proxyBase.search = '';
    return proxyBase.toString();
  }
  return `${getPlatformBaseUrl(env)}/api/v1/gateway/oidcauth`;
}

export function getPlatformDeepLinkReturnUrl(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (isBlackboardLtiMockUiEnabled(env)) {
    const proxyBase = new URL(request.url);
    proxyBase.pathname = '/dev/blackboard-lti-mock/api/v1/lti/deep-linking';
    proxyBase.search = '';
    return proxyBase.toString();
  }
  return `${getPlatformBaseUrl(env)}/api/v1/lti/deep-linking`;
}

export function getPlatformJwksUrl(
  clientId: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return `${getPlatformBaseUrl(env)}/api/v1/management/applications/${encodeURIComponent(
    clientId
  )}/jwks.json`;
}

