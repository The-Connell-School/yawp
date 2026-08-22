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
      // Post back to the mock. Try internal upstream, then same-origin proxy, then returnUrl.
      const candidates: string[] = [];
      const internalMock = String(process.env.BLACKBOARD_LTI_MOCK_URL || '').replace(/\/$/, '');
      if (internalMock) candidates.push(new URL('/api/v1/lti/deep-linking', internalMock).toString());
      candidates.push(new URL('/dev/blackboard-lti-mock/api/v1/lti/deep-linking', getDomainUrl(request)).toString());
      candidates.push(returnUrl);
      const postOnce = async (urlStr: string) => {
        // Try JSON then x-www-form-urlencoded, require 2xx
        let res = await fetch(urlStr, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ JWT: responseJwt }),
        }).catch(() => null);
        if (!res || !res.ok) {
          const body = new URLSearchParams();
          body.set('JWT', responseJwt);
          res = await fetch(urlStr, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
          }).catch(() => null);
        }
        return res?.ok === true;
      };
      for (const urlStr of candidates) {
        const ok = await postOnce(urlStr);
        if (ok) break;
      }
    }
    return redirect('/dev/blackboard-lti-mock/learn/courses');
  }

  // For a normal resource-link launch, establish a session as the LMS user
  // Always allow during LTI launch so the LMS user takes effect on redirect.
  if (messageType === 'LtiResourceLinkRequest') {
    const roles: string[] =
      claims?.['https://purl.imsglobal.org/spec/lti/claim/roles'] || [];
    const isLearner = roles.some((r) =>
      /membership#Learner$/i.test(String(r))
    );
    const previewSeat = await getPreviewAccessSeat(request);
    const orgId = previewSeat?.organizationId ?? null;
    const roleFilter = isLearner ? ('STUDENT' as const) : ('TEACHER' as const);
    // Build a Yawp identity from LTI claims to reflect Ada/Grace instead of a dev persona
    const sub = String(claims?.sub || '').trim() || 'bb-user';
    const claimEmail = String(claims?.email || '').trim() || `${sub}@blackboard.local`;
    const claimName =
      String(claims?.name || '').trim() ||
      [String(claims?.given_name || '').trim(), String(claims?.family_name || '').trim()]
        .filter(Boolean)
        .join(' ') ||
      (isLearner ? 'Ada Student' : 'Grace Instructor');

    // Ensure an in-seat user exists with this identity
    let user =
      (orgId
        ? await prisma.user.findFirst({
            where: { email: claimEmail, memberships: { some: { organizationId: orgId } } },
            select: {
              id: true,
              memberships: {
                where: { organizationId: orgId },
                select: { id: true, role: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
              },
            },
          })
        : await prisma.user.findUnique({
            where: { email: claimEmail },
            select: {
              id: true,
              memberships: {
                select: { id: true, role: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
              },
            },
          })) || null;

    if (!user) {
      const created = await prisma.user.create({
        data: {
          email: claimEmail,
          name: claimName,
          ...(orgId
            ? { memberships: { create: { organizationId: orgId, role: roleFilter } } }
            : {}),
        },
        select: {
          id: true,
          memberships: orgId
            ? {
                where: { organizationId: orgId },
                select: { id: true, role: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
              }
            : { select: { id: true, role: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        },
      });
      user = created;
    } else if (user && orgId && user.memberships.length === 0) {
      await prisma.orgMembership.create({
        data: { userId: user.id, organizationId: orgId, role: roleFilter },
      });
      user = await prisma.user.findFirst({
        where: { id: user.id },
        select: {
          id: true,
          memberships: {
            where: { organizationId: orgId },
            select: { id: true, role: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      });
    }

    if (user) {
      // Opportunistically ensure the mock has a deep-linked content item for THIS preview
      try {
        const currentOrigin = getDomainUrl(request);
        const deepLinksRes = await fetch(
          new URL('/dev/blackboard-lti-mock/dev/deep-links', currentOrigin).toString(),
          { headers: { accept: 'application/json' } }
        ).catch(() => null);
        const hasCurrent =
          deepLinksRes && deepLinksRes.ok
            ? ((await deepLinksRes.json()) as any[])
                .flatMap((r) => r?.contentItems ?? [])
                .some((ci) => String(ci?.url || '').startsWith(currentOrigin))
            : false;
        if (!hasCurrent) {
          const now = Math.floor(Date.now() / 1000);
          const responseJwt = signToolJwt({
            iss: process.env.LTI_CLIENT_ID || 'yawp-blackboard-mock',
            iat: now,
            exp: now + 300,
            'https://purl.imsglobal.org/spec/lti/claim/message_type':
              'LtiDeepLinkingResponse',
            'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
            // deployment_id not required by the mock for DL response; include if present on launch
            ...(claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id']
              ? {
                  'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
                    claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id'],
                }
              : {}),
            'https://purl.imsglobal.org/spec/lti-dl/claim/data': `dl_${now}`,
            'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [
              {
                type: 'ltiResourceLink',
                title: 'Yawp essay',
                url: new URL('/lti/launch', currentOrigin).toString(),
                lineItem: { scoreMaximum: 100, label: 'Yawp essay' },
              },
            ],
          });
          const internalMock = String(process.env.BLACKBOARD_LTI_MOCK_URL || '').replace(
            /\/$/,
            ''
          );
          if (internalMock) {
            await fetch(new URL('/api/v1/lti/deep-linking', internalMock).toString(), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ JWT: responseJwt }),
            }).catch(() => {});
          }
        }
      } catch {}
      // Prefer re-binding the existing browser sessionId to the target user
      const incomingCookies = request.headers.get('cookie');
      const existingSession = await authSessionStorage.getSession(incomingCookies);
      const existingSessionId = existingSession.get(sessionKey) as string | undefined;
      let session = { id: existingSessionId ?? '', expirationDate: getSessionExpirationDate(), userId: user.id } as {
        id: string; expirationDate: Date; userId: string;
      };
      if (existingSessionId) {
        // Re-point the current session to the LTI-launched user
        await prisma.session
          .update({
            where: { id: existingSessionId },
            data: { userId: user.id, expirationDate: getSessionExpirationDate() },
          })
          .catch(async () => {
            // If the cookie pointed at a non-existent session, create one
            const created = await prisma.session.create({
              select: { id: true, expirationDate: true, userId: true },
              data: { expirationDate: getSessionExpirationDate(), userId: user.id },
            });
            session = created;
          });
      } else {
        const created = await prisma.session.create({
          select: { id: true, expirationDate: true, userId: true },
          data: { expirationDate: getSessionExpirationDate(), userId: user.id },
        });
        session = created;
        existingSession.set(sessionKey, session.id);
      }
      // If this is a learner launch, ensure a gradeable submission exists for this student.
      try {
        if (isLearner && user.memberships[0]?.id) {
          const membershipId = user.memberships[0]!.id;
          // Best-effort: enroll the student into one teacher class in-seat so the doc appears
          if (orgId) {
            try {
              // Prefer a class taught by the dev teacher; else pick any class in-seat
              const devTeacher = await prisma.user.findFirst({
                where: {
                  email: 'dev.teacher@yawp.local',
                  memberships: { some: { organizationId: orgId, role: 'TEACHER' } },
                },
                select: {
                  memberships: {
                    where: { organizationId: orgId, role: 'TEACHER' },
                    select: { id: true, classesAsTeacher: { select: { id: true }, take: 1 } },
                    take: 1,
                  },
                },
              });
              let classId = devTeacher?.memberships[0]?.classesAsTeacher[0]?.id ?? null;
              if (!classId) {
                const anyClass = await prisma.class.findFirst({
                  where: { teachers: { some: { organizationId: orgId } }, isArchived: false },
                  select: { id: true },
                  orderBy: { createdAt: 'asc' },
                });
                classId = anyClass?.id ?? null;
              }
              if (classId) {
                await prisma.class.update({
                  where: { id: classId },
                  data: { students: { connect: { id: membershipId } } },
                }).catch(() => {});
              }
            } catch {}
          }
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
      // Commit the (possibly updated) cookie session
      existingSession.unset('impersonationMode');
      existingSession.unset('impersonatorUserId');
      const membershipId = user.memberships[0]?.id ?? '';
      return redirect('/app', {
        status: 303,
        headers: combineHeaders(
          {
            'set-cookie': await authSessionStorage.commitSession(existingSession, {
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

