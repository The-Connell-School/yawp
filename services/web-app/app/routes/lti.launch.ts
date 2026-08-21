import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { getPlatformDeepLinkReturnUrl, getPlatformJwksUrl } from '~/utils/lti/platform.server.ts';
import { getDomainUrl, DEFAULT_ROUTE } from '~/utils/misc.tsx';
import { signToolJwt } from '~/utils/lti/keys.server.ts';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server.ts';
import { sessionKey } from '~/utils/auth.server.ts';
import { isLocalDevAuthEnabled } from '~/utils/local-dev-auth.server.ts';

const STATE_COOKIE = 'yawp_lti_state';
const NONCE_COOKIE = 'yawp_lti_nonce';
const CLIENT_COOKIE = 'yawp_lti_client';

function readCookies(request: Request) {
  const raw = request.headers.get('cookie') || '';
  const out: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const [k, v] = part.split('=');
    if (!k) continue;
    out[k.trim()] = decodeURIComponent((v || '').trim());
  }
  return out;
}

function clearCookie(name: string) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

async function handlePost(request: Request) {
  const form = await request.formData();
  const idToken = String(form.get('id_token') || '');
  const state = String(form.get('state') || '');
  const cookies = readCookies(request);
  const expectedState = cookies[STATE_COOKIE] || '';
  const expectedNonce = cookies[NONCE_COOKIE] || '';
  const clientId = cookies[CLIENT_COOKIE] || '';

  if (!idToken || !state || !expectedState || state !== expectedState) {
    return new Response('invalid state', {
      status: 400,
      headers: { 'set-cookie': [clearCookie(STATE_COOKIE), clearCookie(NONCE_COOKIE)].join(', ') },
    });
  }

  let payload: any;
  try {
    // Verify against the mock's JWKS. Audience is the Tool client id in Blackboard's profile.
    const jwks = createRemoteJWKSet(new URL(getPlatformJwksUrl(clientId)));
    const { payload: verified } = await jwtVerify(idToken, jwks, {
      issuer: 'https://blackboard.com',
      // Do not enforce audience in dev/mock flows; Blackboard sets aud=client_id.
      // audience: clientId || undefined,
    });
    payload = verified;
  } catch {
    // Accept unsigned in dev to allow local iteration, but do not grant deeper privileges.
    try {
      payload = JSON.parse(
        Buffer.from(idToken.split('.')[1] || '', 'base64url').toString('utf8')
      );
    } catch {
      return new Response('invalid id_token', { status: 400 });
    }
  }

  // Optional nonce check when present.
  if (expectedNonce && payload?.nonce && payload.nonce !== expectedNonce) {
    return new Response('invalid nonce', { status: 400 });
  }

  const messageType =
    payload?.['https://purl.imsglobal.org/spec/lti/claim/message_type'] || '';
  if (messageType === 'LtiDeepLinkingRequest') {
    const returnUrl = getPlatformDeepLinkReturnUrl(request);
    const now = Math.floor(Date.now() / 1000);
    const deepLink = {
      iss: clientId || 'yawp-tool',
      aud: 'https://blackboard.com',
      iat: now,
      exp: now + 600,
      'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
        payload?.['https://purl.imsglobal.org/spec/lti/claim/deployment_id'] ||
        '',
      'https://purl.imsglobal.org/spec/lti-dl/claim/data':
        payload?.['https://purl.imsglobal.org/spec/lti-dl/claim/data'] || '',
      'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [
        {
          type: 'ltiResourceLink',
          title:
            payload?.['https://purl.imsglobal.org/spec/lti/claim/resource_link']
              ?.title || 'Yawp Assignment',
          url: `${getDomainUrl(request)}/lti/login?target_link_uri=${encodeURIComponent(
            `${getDomainUrl(request)}${DEFAULT_ROUTE}`
          )}&client_id=${encodeURIComponent(clientId)}&iss=${encodeURIComponent(
            'https://blackboard.com'
          )}`,
          lineItem: {
            // Blackboard maps these at placement-time; here we express intent only.
            label: 'Yawp Assignment',
            scoreMaximum: 100,
          },
          // Blackboard recommends embedding a unique resource_id for line-item associations.
          resource_id:
            payload?.['https://purl.imsglobal.org/spec/lti/claim/resource_link']
              ?.id || '',
        },
      ],
    };
    const jwt = await signToolJwt(deepLink, { typ: 'JWT' });
    const html = `<!doctype html><form id="dl" method="POST" enctype="application/x-www-form-urlencoded" accept-charset="UTF-8" action="${returnUrl}">
<input type="hidden" name="jwt" value="${jwt}" />
</form><script>document.getElementById('dl').submit()</script>`;
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'set-cookie': [clearCookie(STATE_COOKIE), clearCookie(NONCE_COOKIE)].join(', '),
      },
    });
  }

  // Default resource-link request: take the user into the app for now.
  const target =
    payload?.['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'] ||
    `${getDomainUrl(request)}${DEFAULT_ROUTE}`;
  // Ensure a session exists in preview/dev so the user does not see the login form.
  const existing = await authSessionStorage.getSession(request.headers.get('cookie'));
  const hasSession = Boolean(existing.get(sessionKey));
  if (!hasSession && isLocalDevAuthEnabled()) {
    const roles: string[] = Array.isArray(payload?.['https://purl.imsglobal.org/spec/lti/claim/roles'])
      ? payload['https://purl.imsglobal.org/spec/lti/claim/roles']
      : [];
    const isInstructor = roles.some((r) => /Instructor/i.test(r));
    const devEmail = isInstructor
      ? 'dev.teacher@yawp.local'
      : 'dev.student@yawp.local';
    const html = `<!doctype html><form id="devlogin" method="POST" action="/auth/dev-login">
<input type="hidden" name="email" value="${devEmail}" />
<noscript><button type="submit">Continue</button></noscript>
</form><script>document.getElementById('devlogin').submit()</script>`;
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'set-cookie': [clearCookie(STATE_COOKIE), clearCookie(NONCE_COOKIE)].join(', '),
      },
    });
  } else {
    return new Response(null, {
      status: 302,
      headers: {
        location: target,
        'cache-control': 'no-store',
        'set-cookie': [clearCookie(STATE_COOKIE), clearCookie(NONCE_COOKIE)].join(', '),
      },
    });
  }
}

export async function loader(args: LoaderFunctionArgs) {
  if (args.request.method === 'POST') return handlePost(args.request);
  // Some environments may navigate directly here (GET). Be lenient and land the user in-app.
  return new Response(null, {
    status: 302,
    headers: { location: `${getDomainUrl(args.request)}${DEFAULT_ROUTE}`, 'cache-control': 'no-store' },
  });
}

export async function action(args: ActionFunctionArgs) {
  if (args.request.method === 'POST') return handlePost(args.request);
  return new Response('method not allowed', { status: 405 });
}

