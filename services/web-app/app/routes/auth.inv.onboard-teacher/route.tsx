import {
  type MetaFunction,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useNavigation,
  redirect,
} from 'react-router';
import { Form, useLoaderData } from 'react-router';
import { z } from 'zod';
import { Button } from '~/components/ui/button.tsx';
import {
  getPasswordHash,
  getSessionExpirationDate,
  requireAnonymous,
  sessionKey,
} from '~/utils/auth.server.ts';
import { prisma } from '~/utils/db.server.ts';
import {
  NameSchema,
  PasswordAndConfirmPasswordSchema,
} from '~/utils/schemas/user.ts';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server.ts';
import { redirectWithToast } from '~/utils/toast.server.ts';
import { invitationCookieStorage } from '~/cookie-session-storages/invitation.server';
import { validationError, parseFormData, useForm } from '@rvf/react-router';
import { FormInput } from '~/components/rvf-forms/form-input.tsx';
import { FormSelect } from '~/components/rvf-forms/form-select.tsx';
import { setMembershipId } from '~/cookies/membership-id.server';
import { normalizeEmail } from '~/utils/normalize-email';

export const Schema = z
  .object({ name: NameSchema, schoolId: z.string() })
  .and(PasswordAndConfirmPasswordSchema);

async function requireInvitation(request: Request) {
  const invitation = await invitationCookieStorage.getSession(
    request.headers.get('cookie')
  );
  const rawEmail = invitation.get('email') as string | undefined;
  const email = rawEmail ? normalizeEmail(rawEmail) : undefined;
  const organizationId = invitation.get('organizationId');

  if (!email || !organizationId) {
    throw redirectWithToast(
      '/auth/login',
      {
        title: 'Invalid invitation',
        description: 'Please contact your administrator.',
      },
      {
        headers: {
          'set-cookie':
            await invitationCookieStorage.destroySession(invitation),
        },
      }
    );
  }

  return { email, organizationId };
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  const { email, organizationId } = await requireInvitation(request);

  const schools = await prisma.school.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });

  return { email, organizationId, schools };
}

export async function action({ request }: ActionFunctionArgs) {
  const { email, organizationId } = await requireInvitation(request);
  const { data, error } = await parseFormData(request, Schema);
  if (error) return validationError(error);

  const hashedPassword = await getPasswordHash(data.password);

  const membership = await prisma.orgMembership.create({
    data: {
      user: {
        create: {
          email,
          name: data.name,
          password: { create: { hash: hashedPassword } },
        },
      },
      organization: { connect: { id: organizationId } },
      role: 'TEACHER',
      schools: { connect: [{ id: data.schoolId }] },
    },
  });

  const session = await prisma.session.create({
    data: {
      expirationDate: getSessionExpirationDate(),
      user: { connect: { id: membership.userId } },
    },
    select: { id: true, expirationDate: true },
  });

  const cookies = request.headers.get('cookie');
  const authSession = await authSessionStorage.getSession(cookies);
  const invitationCookie = await invitationCookieStorage.getSession(cookies);

  authSession.set(sessionKey, session.id);

  return redirectWithToast(
    '/app',
    { title: 'Welcome', description: 'Thanks for signing up!' },
    {
      headers: {
        'set-cookie': [
          await authSessionStorage.commitSession(authSession, {
            expires: session.expirationDate,
          }),
          await invitationCookieStorage.destroySession(invitationCookie),
          await setMembershipId(membership.id),
        ].join(';'),
      },
    }
  );
}

export const meta: MetaFunction = () => {
  return [{ title: 'Setup Yawp! Account' }];
};

export default function Route() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';

  const form = useForm({
    schema: Schema,
    method: 'POST',
    defaultValues: {
      name: '',
      schoolId: '',
      password: '',
      confirmPassword: '',
    },
  });

  return (
    <div className="mx-auto w-full max-w-lg px-2 py-20">
      <div className="flex flex-col gap-3 text-center">
        <h1>Welcome, {data.email}!</h1>
        <p>Please enter your details.</p>
      </div>
      <Form
        method="POST"
        className="mx-auto mt-20 flex min-w-full max-w-lg flex-col gap-3 px-8 sm:min-w-[368px]"
        {...form.getFormProps()}
      >
        <FormInput
          scope={form.scope('name')}
          type="text"
          label="Name"
          autoComplete="name"
        />
        <FormSelect
          scope={form.scope('schoolId')}
          label="School"
          autoComplete="school"
          options={data.schools.map((school) => ({
            value: school.id,
            label: school.name,
          }))}
        />
        <FormInput
          scope={form.scope('password')}
          label="Password"
          autoComplete="new-password"
          type="password"
        />
        <FormInput
          scope={form.scope('confirmPassword')}
          label="Confirm Password"
          autoComplete="new-password"
          type="password"
        />
        <Button className="mt-4 w-full" type="submit" disabled={isLoading}>
          Create an account
        </Button>
      </Form>
    </div>
  );
}
