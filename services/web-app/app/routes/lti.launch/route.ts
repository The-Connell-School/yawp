import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import {
  destroyLtiBrowserBinding,
  getLtiBrowserBinding,
} from '~/cookies/lti-browser-binding.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { setPendingLtiLink } from '~/cookies/lti-pending-link.server';
import {
  completeLtiLaunch,
  createLtiAuthenticatedSession,
  LtiPilotError,
} from '~/domain/lms/lti-pilot.server';
import { admitLtiPublicRequest } from '~/domain/lms/lti-rate-limit.server';
import {
  getLtiRequesterFingerprint,
  isEmbeddedLtiRequest,
  readBoundedLtiForm,
} from '~/domain/lms/lti-request.server';
import { getUserId, sessionKey } from '~/utils/auth.server';

const MAX_LAUNCH_BODY_BYTES = 24 * 1024;
const MAX_ID_TOKEN_LENGTH = 20 * 1024;
const LTI_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function redirectToError(error: unknown, headers?: Headers) {
  void error;
  const responseHeaders = headers ?? new Headers();
  responseHeaders.set('cache-control', 'no-store');
  return redirect('/lti/error', {
    status: 303,
    headers: responseHeaders,
  });
}

async function parseLaunchForm(request: Request) {
  const parameters = await readBoundedLtiForm(request, {
    maxBytes: MAX_LAUNCH_BODY_BYTES,
  });
  const idTokens = parameters.getAll('id_token');
  const states = parameters.getAll('state');
  if (
    idTokens.length !== 1 ||
    states.length !== 1 ||
    !idTokens[0] ||
    idTokens[0].length > MAX_ID_TOKEN_LENGTH ||
    !states[0] ||
    states[0].length > 512
  ) {
    throw new LtiPilotError('invalid_request', 'LTI launch form is invalid.');
  }
  return { idToken: idTokens[0], state: states[0] };
}

export function loader(_args: LoaderFunctionArgs) {
  return redirect('/lti/error', {
    headers: { 'cache-control': 'no-store' },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const headers = new Headers({ 'cache-control': 'no-store' });
  headers.append('set-cookie', await destroyLtiBrowserBinding());
  try {
    if (isEmbeddedLtiRequest(request)) throw new Error('Embedded launch.');
    admitLtiPublicRequest({
      kind: 'launch',
      requester: getLtiRequesterFingerprint(request),
    });
    const form = await parseLaunchForm(request);
    const browserBinding = await getLtiBrowserBinding(request);
    const currentUserId = await getUserId(request);
    const result = await completeLtiLaunch(form, {
      currentUserId,
      browserBinding,
    });

    if (result.kind === 'link_required') {
      headers.append(
        'set-cookie',
        await setPendingLtiLink({
          id: result.pendingLinkId,
          secret: result.pendingLinkSecret,
        })
      );
      return redirect('/lti/link', { status: 303, headers });
    }

    if (!currentUserId) {
      const session = await createLtiAuthenticatedSession({
        expirationDate: new Date(Date.now() + LTI_SESSION_TTL_MS),
        userId: result.userId,
        membershipId: result.membershipId,
        organizationId: result.organizationId,
        registrationId: result.registrationId,
        externalIdentityId: result.externalIdentityId,
        classId: result.classId,
        role: result.role,
      });
      const authSession = await authSessionStorage.getSession(
        request.headers.get('cookie')
      );
      authSession.set(sessionKey, session.id);
      headers.append(
        'set-cookie',
        await authSessionStorage.commitSession(authSession, {
          expires: session.expirationDate,
        })
      );
    }
    headers.append('set-cookie', await setMembershipId(result.membershipId));
    return redirect(result.destination, { status: 303, headers });
  } catch (error) {
    return redirectToError(error, headers);
  }
}
