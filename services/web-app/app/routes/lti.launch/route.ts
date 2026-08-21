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

  // For a normal resource-link launch, establish a session as the mock user
  // Always allow during LTI launch so the LMS user takes effect on redirect.
  if (messageType === 'LtiResourceLinkRequest') {
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
      // If this is a learner launch, ensure a gradeable submission exists for this student.
      try {
        if (isLearner && user.memberships[0]?.id) {
          const membershipId = user.memberships[0]!.id;
          // Prefer keeping one per resource link per student
          const resourceLink =
            claims?.['https://purl.imsglobal.org/spec/lti/claim/resource_link']
              ?.id || '_99_1';
          const docTitle = `LTI: ${resourceLink}`;
          let doc = await prisma.document.findFirst({
            where: { membershipId, title: docTitle },
            select: { id: true },
          });
          if (!doc) {
            // Pick any visible assignment type as a minimal viable default
            const assignmentType =
              (await prisma.assignmentType.findFirst({
                where: { archivedAt: null },
                select: { id: true },
                orderBy: { createdAt: 'asc' },
              })) || (await prisma.assignmentType.findFirst({ select: { id: true } }));
            if (assignmentType) {
              doc = await prisma.document.create({
                data: {
                  title: docTitle,
                  text: 'LTI submission body',
                  html: '<p>LTI submission body</p>',
                  membershipId,
                  assignmentTypeId: assignmentType.id,
                  submissions: {
                    create: {
                      title: docTitle,
                      text: 'LTI submission body',
                      html: '<p>LTI submission body</p>',
                      submittedAt: new Date(),
                    },
                  },
                },
                select: { id: true },
              });
            }
          } else {
            // Ensure at least one submitted, ungraded attempt exists
            const ungraded = await prisma.submission.findFirst({
              where: { documentId: doc.id, gradedAt: null, archivedAt: null },
              select: { id: true },
            });
            if (!ungraded) {
              await prisma.submission.create({
                data: {
                  documentId: doc.id,
                  title: docTitle,
                  text: 'LTI submission body',
                  html: '<p>LTI submission body</p>',
                  submittedAt: new Date(),
                },
              });
            }
          }
        }
      } catch {
        // Best-effort only: do not block launch if preview data is thin
      }
      // Mirror normal login: update the existing cookie session
      const cookies = request.headers.get('cookie');
      const newAuthSession = await authSessionStorage.getSession(cookies);
      newAuthSession.set(sessionKey, session.id);
      newAuthSession.unset('impersonationMode');
      newAuthSession.unset('impersonatorUserId');
      const membershipId = user.memberships[0]?.id ?? '';
      return redirect('/app', {
        status: 303,
        headers: combineHeaders(
          {
            'set-cookie': await authSessionStorage.commitSession(newAuthSession, {
              expires: session.expirationDate,
            }),
          },
          { 'set-cookie': await setMembershipId(membershipId) }
        ),
      });
    }
  }

  return redirect('/app');
}

