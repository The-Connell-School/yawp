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
    <div className="mx-auto w-full max-w-xs rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 max-sm:w-[calc(100%-2rem)] sm:p-7">
      <div className="flex flex-col items-start gap-2 text-left">
        <h1 className="text-lg font-semibold">Reset your password</h1>
        <p className="text-pretty text-base text-muted-foreground sm:text-sm">
          Choose a new password for {data.email}.
        </p>
      </div>
      <Form
        {...form.getFormProps()}
        className="mt-6 flex flex-col gap-5"
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
        <Button
          className="h-11 w-full text-base sm:h-10 sm:text-sm"
          type="submit"
          disabled={isLoading}
        >
          Reset password
        </Button>
      </Form>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
