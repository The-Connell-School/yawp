import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
  useLoaderData,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { StudentSignupForm } from '~/components/student-signup-form';
import { studentSignupAction } from './signup.server';

export async function loader(_args: LoaderFunctionArgs) {
  return { partner: null };
}

export async function action(args: ActionFunctionArgs) {
  return studentSignupAction(args);
}

export default function SignupRoute() {
  const { partner } = useLoaderData<typeof loader>();
  return <StudentSignupForm partner={partner} />;
}

export const meta: MetaFunction = () => [{ title: 'Sign Up | Yawp!' }];

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
