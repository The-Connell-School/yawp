import {
  redirect,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from 'react-router';
import { AuthBrandLockup } from '~/components/auth-brand-lockup';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { StudentSignupForm } from '~/components/student-signup-form';
import { studentSignupAction } from '~/routes/auth.inv.signup/signup.server';
import { requireAnonymous } from '~/utils/auth.server';
import {
  commitUaPartnerContext,
  destroyUaPartnerContext,
  getUaPartnerCodeCapture,
  getUaPartnerContext,
} from '~/utils/ua-partner.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  const capture = getUaPartnerCodeCapture(request);
  if (capture?.accepted) {
    return redirect(capture.redirectTo, {
      headers: { 'set-cookie': await commitUaPartnerContext() },
    });
  }

  const partnerContext = await getUaPartnerContext(request);
  const url = new URL(request.url);
  return {
    codeAccepted: partnerContext?.partner === 'ua',
    codeError:
      capture || url.searchParams.has('codeError')
        ? 'Enter a valid organization code.'
        : null,
  };
}

export async function action(args: ActionFunctionArgs) {
  const formData = await args.request.clone().formData();
  if (formData.get('intent') === 'clear-partner-code') {
    return redirect('/ua/sign-up', {
      headers: {
        'set-cookie': await destroyUaPartnerContext(args.request),
      },
    });
  }

  return studentSignupAction(args, { partner: 'ua' });
}

export default function UaSignUpRoute() {
  const { codeAccepted, codeError } = useLoaderData<typeof loader>();
  return (
    <div className="min-h-screen py-8">
      <AuthBrandLockup partner="ua" />
      <StudentSignupForm
        partner="ua"
        codeAccepted={codeAccepted}
        codeError={codeError}
        loginHref="/ua/sign-in"
      />
    </div>
  );
}

export const meta: MetaFunction = () => [{ title: 'Sign Up | Yawp!' }];

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
