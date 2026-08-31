import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { StudentSignupForm } from '~/components/student-signup-form';
import { studentSignupAction } from './signup.server';
import { requireAnonymous } from '~/utils/auth.server';
import {
  destroyUaPartnerContext,
  getUaPartnerContext,
  isUaPartnerHost,
} from '~/utils/ua-partner.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  if (!isUaPartnerHost(request)) return { partner: null as null };

  const partnerContext = await getUaPartnerContext(request);
  return {
    partner: 'ua' as const,
    codeAccepted: partnerContext?.partner === 'ua',
    codeError: new URL(request.url).searchParams.has('codeError')
      ? 'Enter a valid organization code.'
      : null,
  };
}

export async function action(args: ActionFunctionArgs) {
  const isUa = isUaPartnerHost(args.request);
  if (isUa) {
    const formData = await args.request.clone().formData();
    if (formData.get('intent') === 'clear-partner-code') {
      return redirect('/auth/inv/signup', {
        headers: {
          'set-cookie': await destroyUaPartnerContext(args.request),
        },
      });
    }
  }
  return studentSignupAction(args, { partner: isUa ? 'ua' : null });
}

export default function SignupRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <StudentSignupForm
      partner={data.partner}
      codeAccepted={'codeAccepted' in data ? data.codeAccepted : false}
      codeError={'codeError' in data ? data.codeError : null}
      loginHref={
        data.partner === 'ua' ? '/auth/login?redirectTo=%2F' : '/auth/login'
      }
      clearCodeAction="/auth/inv/signup"
    />
  );
}

export const meta: MetaFunction = () => [{ title: 'Sign Up | Yawp!' }];

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
