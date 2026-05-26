import {
  data as dataResponse,
  type MetaFunction,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useFetcher,
  Form,
  redirect,
} from 'react-router';
import { Link, useSearchParams } from 'react-router';
import { ArrowRightIcon } from 'lucide-react';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { safeRedirect } from 'remix-utils/safe-redirect';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { FormInput } from '~/components/forms/form-input-2';
import { Button } from '~/components/ui/button';
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

const Schema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  redirectTo: z.string().nullish(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  return dataResponse({});
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
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');
  const fetcher = useFetcher();
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
    <main className="yawp-login-page" data-testid="login-page">
      <section className="yawp-login-panel" data-testid="login-panel">
        <div className="yawp-login-brand">
          <img src="/img/logo_for_light_mode.png" alt="YAWP!" />
        </div>
        <div className="yawp-login-heading">
          <p>Account access</p>
          <h1>Welcome back</h1>
          <span>Continue to your YAWP workspace.</span>
        </div>
        <Form {...form.getFormProps()} className="yawp-login-form">
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
          <div className="yawp-login-forgot">
            <Link to="/auth/inv/forgot-password">Forgot password?</Link>
          </div>
          <Button
            className="yawp-login-submit"
            type="submit"
            isLoading={isLoading}
          >
            Log in
          </Button>
        </Form>
        <div className="yawp-login-secondary">
          <p>New to YAWP?</p>
          <Link
            className="yawp-login-create"
            to={
              redirectTo
                ? `/auth/inv/signup?${encodeURIComponent(redirectTo)}`
                : '/auth/inv/signup'
            }
          >
            Create account <ArrowRightIcon aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}

export const meta: MetaFunction = () => {
  return [{ title: 'Login to Yawp!' }];
};

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
