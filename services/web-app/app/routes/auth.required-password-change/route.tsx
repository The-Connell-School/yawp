import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  Form,
  redirect,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { z } from 'zod';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { Button } from '~/components/ui/button';
import { FormInput } from '~/components/rvf-forms/form-input';
import {
  clearMustChangePassword,
  requireUserId,
  sessionKey,
} from '~/utils/auth.server';
import { PasswordAndConfirmPasswordSchema } from '~/utils/schemas/user';
import { prisma } from '~/utils/db.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { getSessionExpirationDateForUser } from '~/utils/auth.server';
import { mayChangeRequiredPassword } from '~/domain/free-tier/required-password-change';

const Schema = PasswordAndConfirmPasswordSchema;

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request, { skipPasswordChangeGate: true });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { mustChangePassword: true, username: true },
  });
  if (!user.mustChangePassword) {
    throw redirect('/app');
  }
  return { username: user.username };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request, { skipPasswordChangeGate: true });
  const gateUser = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { mustChangePassword: true },
  });
  if (!mayChangeRequiredPassword(gateUser)) {
    throw Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { error, data } = await parseFormData(request, Schema);
  if (error) return validationError(error);

  await clearMustChangePassword(userId, data.password);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });

  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  const sessionId = authSession.get(sessionKey);
  if (sessionId) {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        expirationDate: getSessionExpirationDateForUser({ email: user.email }),
      },
    });
  }

  return redirect('/app');
}

export default function RequiredPasswordChangeRoute() {
  const { username } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const form = useForm({
    schema: Schema,
    method: 'POST',
    defaultValues: { password: '', confirmPassword: '' },
  });

  return (
    <div className="mx-auto w-full max-w-xs rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-7">
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {username
          ? `Your teacher reset the password for @${username}. Set a new one before continuing.`
          : 'Your teacher reset your password. Set a new one before continuing.'}
      </p>
      <Form {...form.getFormProps()} className="mt-6 flex flex-col gap-4">
        <FormInput scope={form.scope('password')} type="password" label="New password" autoFocus />
        <FormInput
          scope={form.scope('confirmPassword')}
          type="password"
          label="Confirm new password"
        />
        <Button type="submit" className="w-full" disabled={navigation.state !== 'idle'}>
          Save and continue
        </Button>
      </Form>
    </div>
  );
}
