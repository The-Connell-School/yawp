import { randomUUID } from 'node:crypto';
import { type LoaderFunctionArgs } from 'react-router';
import { getDomainUrl } from '~/utils/misc';
import { getPlatformOidcAuthUrl } from '~/utils/lti/platform.server';
import { setLtiHandshakeCookieHeader } from '~/utils/lti/handshake.server';
import { rejectWithoutExplicitPreviewDevLoginAccess } from '~/utils/preview-access.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const accessBlock = await rejectWithoutExplicitPreviewDevLoginAccess(request);
  if (accessBlock) return accessBlock;

  const url = new URL(request.url);
  const iss = url.searchParams.get('iss') || '';
  const clientId = url.searchParams.get('client_id') || '';
  const loginHint = url.searchParams.get('login_hint') || '';
  const messageHint = url.searchParams.get('lti_message_hint') || '';
  const targetLinkUri = `${getDomainUrl(request)}/lti/launch`;
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
  if (deploymentId) oidcAuth.searchParams.set('lti_deployment_id', deploymentId);
  oidcAuth.searchParams.set('target_link_uri', targetLinkUri);

  return new Response(null, {
    status: 302,
    headers: {
      location: oidcAuth.toString(),
      'cache-control': 'no-store',
      'set-cookie': setLtiHandshakeCookieHeader(state, nonce, clientId),
    },
  });
}
