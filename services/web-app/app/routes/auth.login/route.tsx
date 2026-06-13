import {
  data as dataResponse,
  type MetaFunction,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useFetcher,
  Form,
  redirect,
} from 'react-router';
import { Link, useSearchParams, useLoaderData } from 'react-router';
import { ArrowRightIcon } from 'lucide-react';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { safeRedirect } from 'remix-utils/safe-redirect';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { FormInput } from '~/components/forms/form-input-2';
import { Button, button } from '~/components/ui/button';
import {
  getSessionExpirationDate,
  requireAnonymous,
  sessionKey,
  verifyUserPassword,
} from '~/utils/auth.server';
import { EmailSchema, PasswordSchema } from '~/utils/schemas/user';
import { prisma } from '~/utils/db.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { posthog } from '~/services/posthog.server';
import { isLocalDevAuthEnabled } from '~/utils/local-dev-auth.server';
import { getLocalDevLoginOptions } from '~/routes/auth.dev-login/route';

const Schema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  redirectTo: z.string().nullish(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  return dataResponse({
    devLoginEnabled: isLocalDevAuthEnabled(),
    devLoginOptions: isLocalDevAuthEnabled() ? getLocalDevLoginOptions() : [],
  });
}

const actionImpl = async ({ request }: ActionFunctionArgs) => {
  await requireAnonymous(request);
  const { error, data } = await parseFormData(request, Schema);
  if (error) return validationError(error);

  try {
    const { email, password } = data;
    const user = await verifyUserPassword({ email }, password);

    if (!user) {
      return validationError(
        { fieldErrors: { email: 'Invalid email or password' } },
        data
      );
    }

    const session = await prisma.session.create({
      select: { id: true, expirationDate: true, userId: true },
      data: {
        expirationDate: getSessionExpirationDate(),
        userId: user.id,
      },
    });

    const cookies = request.headers.get('cookie');
    const authSession = await authSessionStorage.getSession(cookies);
    authSession.set(sessionKey, session.id);

    return redirect(safeRedirect(data.redirectTo, '/app'), {
      headers: {
        'set-cookie': await authSessionStorage.commitSession(authSession, {
          expires: session.expirationDate,
        }),
      },
    });
  } catch (error) {
    posthog?.captureException(error, 'anonymous');
    return validationError(
      { fieldErrors: { email: 'Invalid email or password' } },
      data
    );
  }
};

export async function action(args: ActionFunctionArgs) {
  return actionImpl(args);
}

export default function LoginPage() {
  const { devLoginEnabled, devLoginOptions } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');
  const fetcher = useFetcher();
  const devLoginFetcher = useFetcher();
  const isLoading = fetcher.state !== 'idle';

  const form = useForm({
    schema: Schema,
    method: 'POST',
    defaultValues: { redirectTo, email: '', password: '' },
    validationBehaviorConfig: {
      initial: 'onSubmit',
      whenTouched: 'onSubmit',
      whenSubmitted: 'onSubmit',
    },
  });

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
          <input type="hidden" name="redirectTo" value={redirectTo ?? ''} />
          <FormInput
            scope={form.scope('email')}
            type="email"
            label="Email"
            autoComplete="email"
          />
          <FormInput
            scope={form.scope('password')}
            type="password"
            label="Password"
            autoComplete="current-password"
          />
          <div className="flex items-center justify-end">
            <Link
              to="/auth/inv/forgot-password"
              className={button({ variant: 'link' })}
            >
              Forgot password?
            </Link>
          </div>
          <Button className="w-full" type="submit" isLoading={isLoading}>
            Log in
          </Button>
        </Form>
        {devLoginEnabled ? (
          <div className="my-8 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-6">
            <p className="text-xl font-bold">Local dev quick login</p>
            <p className="text-muted-foreground">
              One-click personas seeded by <code>bun db:seed-local-dev</code>.
            </p>
            <div className="mt-4 grid gap-2">
              {devLoginOptions.map((option) => (
                <devLoginFetcher.Form
                  key={option.email}
                  method="post"
                  action="/auth/dev-login"
                  className="contents"
                >
                  <input type="hidden" name="email" value={option.email} />
                  <input
                    type="hidden"
                    name="redirectTo"
                    value={redirectTo ?? '/app'}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-auto w-full justify-start px-4 py-3 text-left"
                    isLoading={devLoginFetcher.state !== 'idle'}
                  >
                    <span>
                      <span className="block font-semibold">{option.label}</span>
                      <span className="block text-sm text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </Button>
                </devLoginFetcher.Form>
              ))}
            </div>
          </div>
        ) : null}
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
                ? `/auth/inv/signup?${encodeURIComponent(redirectTo)}`
                : '/auth/inv/signup'
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
