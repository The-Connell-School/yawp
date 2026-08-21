import {
  data as dataResponse,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { recordLtiLaunchClaims, signToolJwt } from '~/integrations/blackboard-ags.server';
import { getPreviewAccessSeat, isPreviewAccessGateEnabled } from '~/utils/preview-access.server';
import { prisma } from '~/utils/db.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { sessionKey, getSessionExpirationDate } from '~/utils/auth.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { combineHeaders, getDomainUrl } from '~/utils/misc';

export async function loader() {
  // Launch is a POST; GET can confirm endpoint is up
  return dataResponse({ ok: true });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const idToken = String(form.get('id_token') || '');
  if (!idToken) {
    return dataResponse({ error: 'missing id_token' }, { status: 400 });
  }
  let claims: any = null;
  try {
    const parts = idToken.split('.');
    if (parts.length < 2) throw new Error('malformed jwt');
    claims = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    recordLtiLaunchClaims(claims);
  } catch (error) {
    return dataResponse({ error: 'invalid id_token' }, { status: 400 });
  }

  const messageType =
    claims?.['https://purl.imsglobal.org/spec/lti/claim/message_type'];

  // Handle Deep Linking immediately by returning a signed content item
  if (messageType === 'LtiDeepLinkingRequest') {
    const settings =
      claims?.['https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'] ??
      {};
    const returnUrl = String(settings.deep_link_return_url || '');
    if (returnUrl) {
      const now = Math.floor(Date.now() / 1000);
      const responseJwt = signToolJwt({
        iss: process.env.LTI_CLIENT_ID || 'yawp-blackboard-mock',
        iat: now,
        exp: now + 300,
        nonce: claims.nonce,
        'https://purl.imsglobal.org/spec/lti/claim/message_type':
          'LtiDeepLinkingResponse',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
          claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id'],
        'https://purl.imsglobal.org/spec/lti-dl/claim/data': settings.data,
        'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [
          {
            type: 'ltiResourceLink',
            title: 'Yawp essay',
            url: new URL('/lti/launch', getDomainUrl(request)).toString(),
            lineItem: { scoreMaximum: 100, label: 'Yawp essay' },
          },
        ],
      });
      // Post back to the mock. Prefer internal mock URL for server-to-server calls.
      let postUrl = returnUrl;
      const internalMock = String(process.env.BLACKBOARD_LTI_MOCK_URL || '').replace(/\/$/, '');
      if (internalMock) {
        try {
          const parsed = new URL(returnUrl);
          postUrl = new URL('/api/v1/lti/deep-linking', internalMock).toString();
        } catch {}
      }
      const tryPost = async (asForm: boolean) => {
        if (asForm) {
          const body = new URLSearchParams();
          body.set('JWT', responseJwt);
          await fetch(postUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
          });
        } else {
          await fetch(postUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ JWT: responseJwt }),
          });
        }
      };
      try {
        await tryPost(false);
      } catch {
        try {
          await tryPost(true);
        } catch {}
      }
    }
    return redirect('/dev/blackboard-lti-mock/learn/courses');
  }

  // For a normal resource-link launch, establish a preview session as the mock user
  if (messageType === 'LtiResourceLinkRequest' && isPreviewAccessGateEnabled()) {
    const roles: string[] =
      claims?.['https://purl.imsglobal.org/spec/lti/claim/roles'] || [];
    const isLearner = roles.some((r) =>
      /membership#Learner$/i.test(String(r))
    );
    const desiredEmail = isLearner
      ? 'dev.student@yawp.local'
      : 'dev.teacher@yawp.local';

    const previewSeat = await getPreviewAccessSeat(request);
    // Prefer dev personas; fall back to a seat-scoped user by role (ordered by name asc)
    let user =
      (previewSeat
        ? await prisma.user.findFirst({
            where: {
              email: desiredEmail,
              memberships: { some: { organizationId: previewSeat.organizationId } },
            },
            select: {
              id: true,
              memberships: {
                where: { organizationId: previewSeat.organizationId },
                select: { id: true, role: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
              },
            },
          })
        : await prisma.user.findUnique({
            where: { email: desiredEmail },
            select: {
              id: true,
              memberships: {
                select: { id: true, role: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
              },
            },
          })) || null;

    if (!user && previewSeat) {
      // Fallback: choose first by role within the preview seat, ordered by user name
      const roleFilter = isLearner ? 'STUDENT' : 'TEACHER';
      const candidate = await prisma.user.findFirst({
        where: {
          memberships: {
            some: { organizationId: previewSeat.organizationId, role: roleFilter as any },
          },
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          memberships: {
            where: { organizationId: previewSeat.organizationId, role: roleFilter as any },
            select: { id: true, role: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      });
      if (candidate) user = candidate;
    }

    if (user) {
      const session = await prisma.session.create({
        select: { id: true, expirationDate: true, userId: true },
        data: {
          expirationDate: getSessionExpirationDate(),
          userId: user.id,
        },
      });
      const authSession = await authSessionStorage.getSession(
        request.headers.get('cookie')
      );
      const previousSessionId = authSession.get(sessionKey);
      if (previousSessionId) {
        void prisma.session.deleteMany({ where: { id: previousSessionId } });
      }
      authSession.set(sessionKey, session.id);
      authSession.unset('impersonationMode');
      authSession.unset('impersonatorUserId');
      const membershipId = user.memberships[0]?.id ?? '';
      return redirect(
        '/app',
        {
          headers: combineHeaders(
            {
              'set-cookie': await authSessionStorage.commitSession(authSession, {
                expires: session.expirationDate,
              }),
            },
            { 'set-cookie': await setMembershipId(membershipId) }
          ),
        }
      );
    }
  }

  return redirect('/app');
}

