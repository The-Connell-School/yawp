import { signonRequestOrigin } from './origin.server';
import { createHash } from 'node:crypto';
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';
import { redirect } from 'react-router';
import { EmailSchema } from '~/utils/schemas/user';
import { getUserId, getImpersonationState } from '~/utils/auth.server';
import { isUnifiedSignOnEnabled } from './gate.server';
import {
  browserContext,
  digest,
  FlowError,
  opaque,
  stateFor,
  withFlow,
  type Flow,
} from './flow.server';
import { finishAuthentication } from './authentication.server';

export function googleAvailable() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  );
}
/** PR previews share one OAuth client whose redirect URIs list only a few
 * origins. Their deploy sets GOOGLE_OAUTH_REQUIRE_ORIGIN_ALLOWLIST=true, so
 * Google is offered only on an origin in GOOGLE_OAUTH_ORIGIN_ALLOWLIST
 * (comma-separated, empty by default). Demo and production never set it and
 * keep their current behavior. */
export function googleOriginAllowed(
  origin: string,
  env: Record<string, string | undefined> = process.env
) {
  if (env.GOOGLE_OAUTH_REQUIRE_ORIGIN_ALLOWLIST !== 'true') return true;
  return (env.GOOGLE_OAUTH_ORIGIN_ALLOWLIST ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      try {
        const url = new URL(entry);
        return url.protocol === 'https:' && url.origin === origin;
      } catch {
        return false;
      }
    });
}
export function googleVisibleFor(request: Request) {
  return googleOriginAllowed(signonRequestOrigin(request));
}
export function googleAvailableFor(request: Request) {
  return googleAvailable() && googleVisibleFor(request);
}
export function beginGoogle(flow: Flow, request: Request, linkUserId?: string) {
  if (!googleAvailableFor(request))
    throw new FlowError(
      'Google sign-in is unavailable. Use your email or class code.',
      503
    );
  const state = opaque();
  const nonce = opaque();
  const verifier = opaque();
  const callback = new URL(
    '/auth/unified/google/callback',
    signonRequestOrigin(request)
  ).toString();
  flow.data.google = {
    state: digest(state),
    nonce,
    verifier,
    callback,
    ...(linkUserId ? { linkUserId } : {}),
  };
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: callback,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return { redirectTo: url.toString() };
}
/** Fixed provider endpoints; requests and JWT verification use the same signed
 * ID token. Userinfo, if requested, can never substitute a different subject. */
export async function exchangeGoogle(
  code: string,
  context: NonNullable<Flow['data']['google']>
) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: context.callback,
      grant_type: 'authorization_code',
      code_verifier: context.verifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new FlowError(
      "We couldn't connect to Google. Try again, or use your email below."
    );
  const tokens: unknown = await response.json();
  const idToken = (tokens as { id_token?: unknown })?.id_token;
  if (typeof idToken !== 'string' || idToken.length > 20000)
    throw new FlowError('Google sign-in failed.');
  const keysResponse = await fetch(
    'https://www.googleapis.com/oauth2/v3/certs',
    { signal: AbortSignal.timeout(10000) }
  );
  if (!keysResponse.ok) throw new FlowError('Google sign-in failed.');
  const keys = (await keysResponse.json()) as JSONWebKeySet;
  const { payload } = await jwtVerify(idToken, createLocalJWKSet(keys), {
    algorithms: ['RS256'],
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    requiredClaims: ['sub', 'iat', 'exp', 'nonce', 'email', 'email_verified'],
    maxTokenAge: '10m',
  });
  if (
    payload.nonce !== context.nonce ||
    payload.email_verified !== true ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    !EmailSchema.safeParse(payload.email).success ||
    (Array.isArray(payload.aud) &&
      payload.aud.length > 1 &&
      payload.azp !== process.env.GOOGLE_OAUTH_CLIENT_ID) ||
    (payload.azp !== undefined &&
      payload.azp !== process.env.GOOGLE_OAUTH_CLIENT_ID)
  )
    throw new FlowError('Google could not verify this identity.');
  return {
    subject: payload.sub,
    email: (payload.email as string).trim().toLowerCase(),
  };
}
/** The callback is a top-level browser navigation: any screen state
 * finishAuthentication returns as JSON (inactive, membership, link-google) is
 * already saved on the flow, so send the browser back to the sign-in page to
 * render it, keeping the session cookie. */
export function toCallbackRedirect(response: Response): Response {
  if (response.status >= 300 && response.status < 400) return response;
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (
      key.toLowerCase() !== 'set-cookie' &&
      key.toLowerCase() !== 'content-type'
    )
      headers.set(key, value);
  });
  for (const cookie of response.headers.getSetCookie())
    headers.append('set-cookie', cookie);
  headers.set('Location', '/auth/login?continue=1');
  return new Response(null, { status: 302, headers });
}
export async function googleCallback(request: Request): Promise<Response> {
  if (!(await isUnifiedSignOnEnabled()))
    return new Response('Not found', { status: 404 });
  if (!googleAvailableFor(request))
    return Response.json(
      { error: 'Google sign-in is unavailable.' },
      { status: 503 }
    );
  try {
    if ((await getImpersonationState(request)).isReadOnly)
      throw new FlowError('Read-only impersonation active.', 403);
    const context = await browserContext(request);
    const params = new URL(request.url).searchParams;
    // Consume state before any provider request, even on cancellation or failure.
    const oauth = await withFlow(request, context?.token, async (flow) => {
      const oauth = flow.data.google;
      if (!oauth || digest(params.get('state') || '') !== oauth.state)
        throw new FlowError('This Google sign-in expired. Start again.');
      flow.data.google = undefined;
      return oauth;
    });
    if (params.has('error')) {
      await withFlow(request, context?.token, async (flow) =>
        stateFor(flow, {
          screen: 'entry',
          notice:
            params.get('error') === 'access_denied'
              ? 'Google sign-in was cancelled. Try again, or use your email below.'
              : "We couldn't connect to Google. Try again, or use your email below.",
        })
      );
      return redirect('/auth/login?continue=1');
    }
    const code = params.get('code');
    if (!code || code.length > 4096)
      throw new FlowError('Google sign-in failed.');
    const identity = await exchangeGoogle(code, oauth);
    const authenticated = await getUserId(request);
    return await withFlow(request, context?.token, async (flow, tx) => {
      if (oauth.linkUserId && authenticated !== oauth.linkUserId)
        throw new FlowError('Sign in to link this account.', 401);
      const linked = await tx.signonIdentity.findUnique({
        where: {
          provider_subject: { provider: 'google', subject: identity.subject },
        },
      });
      if (linked) {
        if (oauth.linkUserId && linked.userId !== oauth.linkUserId)
          throw new FlowError('This Google identity is already linked.', 403);
        flow.data.pendingGoogle = undefined;
        flow.data.studentGoogle = undefined;
        flow.data.invitationId = undefined;
        flow.data.otp = undefined;
        flow.data.proof = 'google';
        const linkedUser = await tx.user.findUniqueOrThrow({
          where: { id: linked.userId },
          select: { email: true, username: true },
        });
        flow.data.identifier =
          linkedUser.email ||
          (linkedUser.username ? '@' + linkedUser.username : undefined);
        if (linkedUser.email?.toLowerCase() === identity.email) {
          const invite = await tx.invitation.findFirst({
            where: {
              target: { equals: identity.email, mode: 'insensitive' },
              type: {
                in: ['onboard-student', 'onboard-teacher', 'onboard-owner'],
              },
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          });
          flow.data.invitationId = invite?.id;
        }
        return toCallbackRedirect(
          await finishAuthentication(tx, flow, request, linked.userId)
        );
      }
      const account = await tx.user.findFirst({
        where: { email: { equals: identity.email, mode: 'insensitive' } },
        select: { id: true, password: { select: { userId: true } } },
      });
      // Matching email alone cannot link or authenticate an existing account.
      flow.data.identifier = identity.email;
      flow.data.userId = account?.id;
      flow.data.pendingGoogle = identity;
      flow.data.otp = undefined;
      flow.data.proof = account ? undefined : 'google';
      const invitation = await tx.invitation.findFirst({
        where: {
          target: { equals: identity.email, mode: 'insensitive' },
          type: {
            in: ['onboard-student', 'onboard-teacher', 'onboard-owner'],
          },
          ...(account
            ? { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
            : {}),
        },
        select: { id: true },
      });
      flow.data.invitationId = invitation?.id;
      if (!account) {
        // A new Google subject is not an email-based student identity.
        flow.data.identifier = undefined;
        flow.data.userId = undefined;
        flow.data.pendingGoogle = undefined;
        flow.data.studentGoogle = { subject: identity.subject };
        flow.data.proof = undefined;
        flow.data.invitationId = undefined;
        flow.data.classId = undefined;
        flow.data.classCode = undefined;
        flow.data.classCandidates = undefined;
        flow.data.studentChoice = undefined;
        stateFor(flow, {
          screen: 'class-code',
          notice: 'Enter your class code to continue.',
        });
        return redirect('/auth/login?continue=1');
      }

      stateFor(flow, {
        screen: account
          ? account.password
            ? 'password'
            : 'activation'
          : flow.data.classId
            ? 'name-password'
            : flow.data.partnerEntry
              ? flow.data.partner
                ? 'name-password'
                : 'partner-code'
              : 'account-type',
        identifier: identity.email,
        variant: account ? undefined : 'google',
        notice: account
          ? 'Sign in to your existing account before linking Google.'
          : undefined,
      });
      return redirect('/auth/login?continue=1');
    });
  } catch (error) {
    // Never log codes, provider tokens, client secrets or identity payloads.
    const context = await browserContext(request);
    try {
      await withFlow(request, context?.token, async (flow) =>
        stateFor(flow, {
          screen: 'entry',
          error:
            "We couldn't connect to Google. Try again, or use your email below.",
        })
      );
      return redirect('/auth/login?continue=1');
    } catch {
      return redirect('/auth/login?googleError=1');
    }
  }
}
