import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { initiateLtiLogin } from '~/domain/lms/lti-pilot.server';
import { readBoundedLtiForm } from '~/domain/lms/lti-request.server';

const MAX_LOGIN_BODY_BYTES = 8 * 1024;

function errorRedirect(error: unknown) {
  void error;
  return redirect('/lti/error', {
    headers: { 'cache-control': 'no-store' },
  });
}

async function begin(parameters: URLSearchParams) {
  try {
    const result = await initiateLtiLogin(parameters);
    return redirect(result.authorizationUrl.toString(), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return errorRedirect(error);
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  return begin(new URL(request.url).searchParams);
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    return begin(
      await readBoundedLtiForm(request, { maxBytes: MAX_LOGIN_BODY_BYTES })
    );
  } catch (error) {
    return errorRedirect(error);
  }
}
