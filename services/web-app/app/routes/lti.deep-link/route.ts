import type { ActionFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import {
  destroyLtiBrowserBinding,
  getLtiBrowserBinding,
} from '~/cookies/lti-browser-binding.server';
import { setLtiDeepLinkCookie } from '~/cookies/lti-deep-link.server';
import { completeLtiDeepLinkLaunch } from '~/domain/lms/lti-pilot.server';
import { readBoundedLtiForm } from '~/domain/lms/lti-request.server';
import { getUserId } from '~/utils/auth.server';

const MAX_BODY_BYTES = 24 * 1024;

/**
 * The LMS callback is deliberately a resource route. LTI Deep Linking uses a
 * signed cross-origin form POST, while React Router UI actions correctly reject
 * cross-origin form submissions before route code runs. The signed state,
 * nonce, browser binding, issuer, audience, deployment, role, and target-link
 * checks below are the callback's authentication boundary.
 */
export async function action({ request }: ActionFunctionArgs) {
  const headers = new Headers({
    'cache-control': 'no-store',
    'set-cookie': await destroyLtiBrowserBinding(),
  });
  try {
    const parameters = await readBoundedLtiForm(request, {
      maxBytes: MAX_BODY_BYTES,
    });
    const idTokens = parameters.getAll('id_token');
    const states = parameters.getAll('state');
    if (idTokens.length !== 1 || states.length !== 1) throw new Error();
    const result = await completeLtiDeepLinkLaunch(
      { idToken: idTokens[0]!, state: states[0]! },
      {
        currentUserId: await getUserId(request),
        browserBinding: await getLtiBrowserBinding(request),
      }
    );
    headers.append(
      'set-cookie',
      await setLtiDeepLinkCookie({
        id: result.requestId,
        secret: result.browserSecret,
      })
    );
    return redirect('/lti/deep-link/select', { status: 303, headers });
  } catch {
    return redirect('/lti/error', { status: 303, headers });
  }
}
