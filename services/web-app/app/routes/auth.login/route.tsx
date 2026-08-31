import {
  type MetaFunction,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useSearchParams,
} from 'react-router';
import { LoginForm } from '~/components/login-form';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { requireAnonymous } from '~/utils/auth.server';
import { loginAction } from './login.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  return null;
}

export async function action(args: ActionFunctionArgs) {
  return loginAction(args);
}

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  return <LoginForm redirectTo={searchParams.get('redirectTo')} />;
}

export const meta: MetaFunction = () => [{ title: 'Login to Yawp!' }];

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
