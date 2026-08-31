import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from 'react-router';
import { AuthBrandLockup } from '~/components/auth-brand-lockup';
import { LoginForm } from '~/components/login-form';
import { loginAction } from '~/routes/auth.login/login.server';
import { requireAnonymous } from '~/utils/auth.server';
import {
  commitUaPartnerContext,
  getUaPartnerCodeCapture,
} from '~/utils/ua-partner.server';

export async function loader({ request }: LoaderFunctionArgs) {
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
    <div className="min-h-screen py-8">
      <AuthBrandLockup partner="ua" />
      <LoginForm redirectTo="/ua" signupHref="/ua/sign-up" />
    </div>
  );
}

export const meta: MetaFunction = () => [{ title: 'Sign In | Yawp!' }];
