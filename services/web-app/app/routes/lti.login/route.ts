import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { setLtiBrowserBinding } from '~/cookies/lti-browser-binding.server';
import { initiateLtiLogin } from '~/domain/lms/lti-pilot.server';
import { admitLtiPublicRequest } from '~/domain/lms/lti-rate-limit.server';
import {
  getLtiRequesterFingerprint,
  isEmbeddedLtiRequest,
  readBoundedLtiForm,
} from '~/domain/lms/lti-request.server';

const MAX_LOGIN_BODY_BYTES = 8 * 1024;

function errorRedirect(error: unknown) {
  void error;
  return redirect('/lti/error', {
    headers: { 'cache-control': 'no-store' },
  });
}

async function begin(request: Request, parameters: URLSearchParams) {
  try {
    if (isEmbeddedLtiRequest(request)) throw new Error('Embedded launch.');
    const requesterFingerprint = getLtiRequesterFingerprint(request);
    admitLtiPublicRequest({ kind: 'login', requester: requesterFingerprint });
    const result = await initiateLtiLogin(parameters, {
      requesterFingerprint,
    });
    return redirect(result.authorizationUrl.toString(), {
      headers: {
        'cache-control': 'no-store',
        'set-cookie': await setLtiBrowserBinding({
          transactionId: result.transactionId,
          secret: result.browserBindingSecret,
        }),
      },
    });
  } catch (error) {
    return errorRedirect(error);
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  return begin(request, new URL(request.url).searchParams);
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    return begin(
      request,
      await readBoundedLtiForm(request, { maxBytes: MAX_LOGIN_BODY_BYTES })
    );
  } catch (error) {
    return errorRedirect(error);
  }
}
