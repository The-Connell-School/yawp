import { randomUUID } from 'node:crypto';
import type { LoaderFunctionArgs } from 'react-router';
import { getDomainUrl } from '~/utils/misc.tsx';
import { getPlatformOidcAuthUrl } from '~/utils/lti/platform.server.ts';

const STATE_COOKIE = 'yawp_lti_state';
const NONCE_COOKIE = 'yawp_lti_nonce';
const CLIENT_COOKIE = 'yawp_lti_client';

function setCookie(name: string, value: string) {
  const expires = new Date(Date.now() + 10 * 60 * 1000).toUTCString(); // 10 minutes
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const iss = url.searchParams.get('iss') || '';
  const clientId = url.searchParams.get('client_id') || '';
  const loginHint = url.searchParams.get('login_hint') || '';
  const messageHint = url.searchParams.get('lti_message_hint') || '';
  const targetLinkUri =
    url.searchParams.get('target_link_uri') ||
    `${getDomainUrl(request)}/lti/launch`;
  const deploymentId = url.searchParams.get('lti_deployment_id') || '';

  if (!iss || !clientId || !loginHint) {
    return new Response('missing required parameters', { status: 400 });
  }

  const state = randomUUID();
  const nonce = randomUUID();

  const oidcAuth = new URL(getPlatformOidcAuthUrl(request));
  oidcAuth.searchParams.set('scope', 'openid');
  oidcAuth.searchParams.set('response_type', 'id_token');
  oidcAuth.searchParams.set('response_mode', 'form_post');
  oidcAuth.searchParams.set('prompt', 'none');
  oidcAuth.searchParams.set('redirect_uri', `${getDomainUrl(request)}/lti/launch`);
  oidcAuth.searchParams.set('client_id', clientId);
  oidcAuth.searchParams.set('login_hint', loginHint);
  if (messageHint) oidcAuth.searchParams.set('lti_message_hint', messageHint);
  oidcAuth.searchParams.set('state', state);
  oidcAuth.searchParams.set('nonce', nonce);
  // Echo through for the mock's dev helpers; platforms ignore unknown params.
  if (deploymentId) oidcAuth.searchParams.set('lti_deployment_id', deploymentId);
  if (targetLinkUri)
    oidcAuth.searchParams.set('target_link_uri', targetLinkUri);

  const headers = new Headers({
    location: oidcAuth.toString(),
    'cache-control': 'no-store',
    'set-cookie': [
      setCookie(STATE_COOKIE, state),
      setCookie(NONCE_COOKIE, nonce),
      setCookie(CLIENT_COOKIE, clientId),
    ].join(', '),
  });
  return new Response(null, { status: 302, headers });
}

