import {
  type MetaFunction,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
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
import {
  getPreviewAccessSeat,
  isIsolatedPreviewSeatMode,
} from '~/utils/preview-access.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { combineHeaders } from '~/utils/misc';

const Schema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  redirectTo: z.string().nullish(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  return null;
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

    let previewMembershipId: string | null = null;
    if (isIsolatedPreviewSeatMode()) {
      const seat = await getPreviewAccessSeat(request);
      const seatMembership = seat
        ? await prisma.orgMembership.findFirst({
            where: {
              userId: user.id,
              organizationId: seat.organizationId,
              isActive: true,
            },
            select: { id: true },
          })
        : null;
      if (!seatMembership) {
        return validationError(
          { fieldErrors: { email: 'Invalid email or password' } },
          data
        );
      }
      previewMembershipId = seatMembership.id;
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
      headers: combineHeaders(
        {
          'set-cookie': await authSessionStorage.commitSession(authSession, {
            expires: session.expirationDate,
          }),
        },
        previewMembershipId
          ? { 'set-cookie': await setMembershipId(previewMembershipId) }
          : null
      ),
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
          <Button className="w-full" type="submit">
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
