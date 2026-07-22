import type { ActionFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import {
  destroyLtiDeepLinkCookie,
  getLtiDeepLinkCookie,
} from '~/cookies/lti-deep-link.server';
import { selectLtiDeepLinkPlacement } from '~/domain/lms/lti-pilot.server';
import { readBoundedLtiForm } from '~/domain/lms/lti-request.server';
import { getUserId } from '~/utils/auth.server';

const MAX_BODY_BYTES = 24 * 1024;

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * A resource route renders the standalone signed return form. The authenticated
 * session, one-time Deep Linking cookie, and persisted teacher/assignment
 * bindings provide CSRF, replay, user, course, and tenant protection.
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const parameters = await readBoundedLtiForm(request, {
      maxBytes: MAX_BODY_BYTES,
    });
    const cookie = await getLtiDeepLinkCookie(request);
    const userId = await getUserId(request);
    const assignmentIds = parameters.getAll('classAssignmentId');
    if (!cookie || !userId || assignmentIds.length !== 1 || !assignmentIds[0]) {
      throw new Error('invalid selection');
    }
    const result = await selectLtiDeepLinkPlacement({
      requestId: cookie.id,
      browserSecret: cookie.secret,
      teacherUserId: userId,
      classAssignmentId: assignmentIds[0],
    });
    const returnUrl = escapeHtml(result.returnUrl);
    const jwt = escapeHtml(result.responseJwt);
    const returnOrigin = new URL(result.returnUrl).origin;
    return new Response(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Return to LMS</title></head><body><main><h1>Assignment ready</h1><p>Return this assignment to your LMS course.</p><form method="post" action="${returnUrl}"><input type="hidden" name="JWT" value="${jwt}"><button type="submit" autofocus>Return to LMS</button></form></main></body></html>`,
      {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/html; charset=utf-8',
          'set-cookie': await destroyLtiDeepLinkCookie(),
          'content-security-policy': `default-src 'none'; form-action ${returnOrigin}; style-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
          'x-content-type-options': 'nosniff',
        },
      }
    );
  } catch {
    return redirect('/lti/error', {
      headers: { 'set-cookie': await destroyLtiDeepLinkCookie() },
    });
  }
}
