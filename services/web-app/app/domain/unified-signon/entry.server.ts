import { safeRedirect } from 'remix-utils/safe-redirect';
import { requireAnonymous } from '~/utils/auth.server';
import { isUnifiedSignOnEnabled } from './gate.server';
import type { ActionFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { loginAction } from '~/routes/auth.login/login.server';

export async function unifiedEntry(request: Request) {
  try {
    await requireAnonymous(request);
  } catch (response) {
    // Preserve the legacy guard and its exact response when off. The enabled
    // design sends an already authenticated visitor to the existing app gate.
    if (
      response instanceof Response &&
      response.status === 302 &&
      response.headers.get('Location') === '/' &&
      (await isUnifiedSignOnEnabled())
    ) {
      throw redirect('/app');
    }
    throw response;
  }
  if (!(await isUnifiedSignOnEnabled())) return null;
  return {
    unified: true as const,
    redirectTo: safeRedirect(
      new URL(request.url).searchParams.get('redirectTo'),
      '/app'
    ),
    // OAuth is intentionally unavailable until PR 3 implements the callback.
    // Merely setting provider credentials must not expose an inert button.
    googleAvailable: false,
  };
}

export async function dispatchUnifiedLogin(args: ActionFunctionArgs) {
  if (!(await isUnifiedSignOnEnabled())) return loginAction(args);
  await requireAnonymous(args.request);
  // Clone only after the gate. Legacy form validation sees the original body.
  const form = await args.request.clone().formData();
  if (!form.has('intent') || form.get('intent') === 'password')
    return loginAction(args);
  // No resolver, OTP, membership, account creation, or Google side effects in
  // this UI item. A submitted fixture/screen selector cannot grant a session.
  return Response.json(
    {
      error:
        'This sign-in option is not available yet. Please try again later.',
    },
    { status: 503 }
  );
}
