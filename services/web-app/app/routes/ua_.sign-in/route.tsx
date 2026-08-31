import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from 'react-router';
import { AuthPageShell } from '~/components/auth-brand-lockup';
import { LoginForm } from '~/components/login-form';
import { loginAction } from '~/routes/auth.login/login.server';
import { requireAnonymous } from '~/utils/auth.server';
import {
  commitUaPartnerContext,
  getCanonicalUaUrl,
  getUaPartnerCodeCapture,
} from '~/utils/ua-partner.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const canonicalUrl = getCanonicalUaUrl(request, '/auth/login');
  if (canonicalUrl) {
    const target = new URL(canonicalUrl);
    target.searchParams.set('redirectTo', '/');
    return redirect(target.toString());
  }
  await requireAnonymous(request);
  const capture = getUaPartnerCodeCapture(request);
  if (!capture) return null;

  return redirect(capture.redirectTo, {
    headers: capture.accepted
      ? { 'set-cookie': await commitUaPartnerContext() }
      : undefined,
  });
}

export async function action(args: ActionFunctionArgs) {
  return loginAction(args);
}

export default function UaSignInRoute() {
  return (
    <AuthPageShell>
      <LoginForm redirectTo="/ua" signupHref="/ua/sign-up" />
    </AuthPageShell>
  );
}

export const meta: MetaFunction = () => [{ title: 'Sign In | Yawp!' }];
