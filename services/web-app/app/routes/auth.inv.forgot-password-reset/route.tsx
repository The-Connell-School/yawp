import {
  redirect,
  type MetaFunction,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useNavigation,
} from 'react-router';
import { Form, useLoaderData } from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary.tsx';
import { Button } from '~/components/ui/button.tsx';
import { requireAnonymous, resetUserPassword } from '~/utils/auth.server.ts';
import { PasswordAndConfirmPasswordSchema } from '~/utils/schemas/user.ts';
import { invitationCookieStorage } from '~/cookie-session-storages/invitation.server.ts';
import { validationError, parseFormData, useForm } from '@rvf/react-router';
import { FormInput } from '~/components/rvf-forms/form-input';
import { redirectWithToast } from '~/utils/toast.server';
import { normalizeEmail } from '~/utils/normalize-email';

async function requireInvitation(request: Request) {
  const invitation = await invitationCookieStorage.getSession(
    request.headers.get('cookie')
  );
  const rawEmail = invitation.get('email') as string | undefined;
  const email = rawEmail ? normalizeEmail(rawEmail) : undefined;

  if (!email) {
    throw redirectWithToast('/auth/login', {
      title: 'Invalid invitation',
      description: 'Please contact your administrator.',
    });
  }

  return { email };
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  const { email } = await requireInvitation(request);
  return { email };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAnonymous(request);
  const { email } = await requireInvitation(request);
  const { data, error } = await parseFormData(
    request,
    PasswordAndConfirmPasswordSchema
  );
  if (error) return validationError(error);

  const { password } = data;
  await resetUserPassword({ email, password });
  const invitation = await invitationCookieStorage.getSession(
    request.headers.get('cookie')
  );

  return redirectWithToast(
    '/auth/login',
    {
      title: 'Password reset',
      description: 'Your password has been reset.',
    },
    {
      headers: {
        'set-cookie': await invitationCookieStorage.destroySession(invitation),
      },
    }
  );
}

export const meta: MetaFunction = () => {
  return [{ title: 'Reset Password | Yawp!' }];
};

export default function ResetPasswordPage() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';

  const form = useForm({
    id: 'reset-password',
    schema: PasswordAndConfirmPasswordSchema,
    method: 'POST',
    defaultValues: { password: '', confirmPassword: '' },
  });

  return (
    <div className="container flex flex-col justify-center pb-32 pt-20">
      <div className="text-center">
        <h1 className="text-h1">Password Reset</h1>
        <p className="text-body-md mt-3 text-muted-foreground">
          Hi, {data.email}. No worries. It happens all the time.
        </p>
      </div>
      <div className="mx-auto mt-16 min-w-full max-w-sm px-8 sm:min-w-[368px]">
        <Form
          {...form.getFormProps()}
          className="flex flex-col gap-4"
          method="POST"
        >
          <FormInput
            scope={form.scope('password')}
            type="password"
            label="New Password"
            autoComplete="new-password"
          />
          <FormInput
            scope={form.scope('confirmPassword')}
            type="password"
            label="Confirm Password"
            autoComplete="new-password"
          />
          <Button className="w-full" type="submit" disabled={isLoading}>
            Reset password
          </Button>
        </Form>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
