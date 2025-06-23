import {
  data as dataResponse,
  type MetaFunction,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useFetcher,
  Form,
} from 'react-router';
import { Link, useSearchParams } from 'react-router';
import { ArrowRightIcon } from 'lucide-react';
import { AuthenticityTokenInput } from 'remix-utils/csrf/react';
import { HoneypotInputs } from 'remix-utils/honeypot/react';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { FormInput } from '~/components/forms/form-input-2';
import { Button, button } from '~/components/ui/button';
import { login, requireAnonymous } from '~/utils/auth.server';
import { DEFAULT_ROUTE } from '~/utils/misc';
import { EmailSchema, PasswordSchema } from '~/utils/schemas/user';
import { handleNewSession } from './utils.server';

const Schema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  redirectTo: z.string().nullish(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  return dataResponse({});
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAnonymous(request);
  const { error, data } = await parseFormData(request, Schema);
  if (error) return validationError(error);

  const session = await login(data);

  if (session) {
    return handleNewSession({
      request,
      session,
      redirectTo: data.redirectTo ?? DEFAULT_ROUTE,
    });
  } else {
    return validationError(
      { fieldErrors: { email: 'Invalid email or password' } },
      data
    );
  }
}

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== 'idle';

  const form = useForm({
    schema: Schema,
    method: 'POST',
    defaultValues: { redirectTo, email: '', password: '' },
  });

  console.log(form.formState.fieldErrors);

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mt-8 flex flex-col gap-3 text-center">
        <img
          src="/img/logo_for_light_mode.png"
          alt="Logo"
          className="mx-auto mb-8 h-auto w-48 rounded object-cover sm:w-52"
        />
        <h1>Welcome back!</h1>
        <p>Please enter your details.</p>
      </div>
      <div className="mx-auto mt-10 w-full max-w-md px-8">
        <Form {...form.getFormProps()} className="flex flex-col gap-3">
          <AuthenticityTokenInput />
          <HoneypotInputs />
          <input type="hidden" name="redirectTo" />
          <FormInput
            scope={form.scope('email')}
            type="email"
            label="Email"
            autoComplete="email"
            autoFocus
          />
          <FormInput
            scope={form.scope('password')}
            type="password"
            label="Password"
            autoComplete="current-password"
          />
          <div className="flex items-center justify-end">
            <Link
              to="/auth/forgot-password"
              className={button({ variant: 'link' })}
            >
              Forgot password?
            </Link>
          </div>
          <Button className="w-full" type="submit" isLoading={isLoading}>
            Log in
          </Button>
        </Form>
        <div className="my-8 rounded-xl border bg-muted p-6">
          <p className="text-xl font-bold">New here?</p>
          <p className="text-muted-foreground">
            Create an account to get started.
          </p>
          <Link
            className={button({
              variant: 'outline',
              size: 'lg',
              className: 'mt-4 w-full shadow',
            })}
            to={
              redirectTo
                ? `/auth/signup?${encodeURIComponent(redirectTo)}`
                : '/auth/signup'
            }
          >
            Create an account <ArrowRightIcon className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [{ title: 'Login to Yawp!' }];
};

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
