import {
  type MetaFunction,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useNavigation,
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
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { FormInput } from '~/components/rvf-forms/form-input.tsx';
import { FormSelect } from '~/components/rvf-forms/form-select.tsx';
import { setMembershipId } from '~/cookies/membership-id.server.ts';
import { normalizeEmail } from '~/utils/normalize-email';
import { formatClassGradePeriod } from '~/utils/class-display';
import { combineHeaders } from '~/utils/misc';
import {
  destroyUaPartnerContext,
  requireUaOrganizationId,
} from '~/utils/ua-partner.server';

export const GenericSchema = z
  .object({
    name: NameSchema,
    classId: z.string().min(1, 'Class is required'),
  })
  .and(PasswordAndConfirmPasswordSchema);

export const UaSchema = z
  .object({ name: NameSchema, classId: z.string().optional() })
  .and(PasswordAndConfirmPasswordSchema);

async function requireInvitation(request: Request) {
  const invitation = await invitationCookieStorage.getSession(
    request.headers.get('cookie')
  );
  const rawEmail = invitation.get('email') as string | undefined;
  const email = rawEmail ? normalizeEmail(rawEmail) : undefined;
  const klassId = invitation.get('klassId') as string | undefined;
  const klassIds = invitation.get('klassIds') as string[] | undefined;
  const schoolId = invitation.get('schoolId') as string | undefined;
  const partner = invitation.get('partner') as string | undefined;
  const organizationId = invitation.get('organizationId') as string | undefined;

  const classIds = Array.from(
    new Set(
      [klassId, ...(Array.isArray(klassIds) ? klassIds : [])].filter(Boolean)
    )
  ) as string[];

  const isUa =
    partner === 'ua' &&
    Boolean(organizationId) &&
    organizationId === requireUaOrganizationId();

  if (!email || (!isUa && classIds.length === 0 && !schoolId)) {
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

  return {
    email,
    classIds,
    schoolId,
    partner: isUa ? ('ua' as const) : null,
    organizationId,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  const { email, classIds, schoolId, partner } =
    await requireInvitation(request);

  if (partner === 'ua') {
    return { email, classes: [], partner };
  }

  const classes = await prisma.class.findMany({
    where: {
      OR: [
        ...(classIds.length ? [{ id: { in: classIds } }] : []),
        ...(schoolId ? [{ schoolId }] : []),
      ],
      isArchived: false,
    },
    select: {
      id: true,
      code: true,
      schoolYear: true,
      grade: true,
      period: true,
      school: { select: { name: true, organizationId: true } },
      teachers: {
        select: { user: { select: { name: true } } },
      },
    },
    orderBy: [{ schoolYear: 'desc' }, { grade: 'asc' }, { period: 'asc' }],
  });

  if (classes.length === 0) {
    throw redirectWithToast('/auth/login', {
      title: 'Invalid invitation',
      description: 'Class not found.',
    });
  }

  return { email, classes, partner: null };
}

export async function action({ request }: ActionFunctionArgs) {
  const { email, classIds, schoolId, partner, organizationId } =
    await requireInvitation(request);
  const { data, error } = await parseFormData(
    request,
    partner === 'ua' ? UaSchema : GenericSchema
  );
  if (error) return validationError(error);

  const klass =
    partner === 'ua'
      ? null
      : await prisma.class.findFirst({
          where: {
            id: data.classId!,
            isArchived: false,
            ...(classIds.length ? { id: { in: classIds } } : {}),
            ...(schoolId ? { schoolId } : {}),
          },
          select: {
            id: true,
            school: { select: { organizationId: true } },
          },
        });

  if (partner !== 'ua' && !klass) {
    return validationError({ fieldErrors: { classId: 'Class not found' } });
  }

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
      organization: {
        connect: {
          id: partner === 'ua' ? organizationId! : klass!.school.organizationId,
        },
      },
      role: 'STUDENT',
      ...(klass ? { classesAsStudent: { connect: { id: klass.id } } } : {}),
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
    partner === 'ua' ? '/billing/ua' : '/app',
    { title: 'Welcome', description: 'Thanks for signing up!' },
    {
      headers: combineHeaders(
        {
          'set-cookie': await authSessionStorage.commitSession(authSession, {
            expires: session.expirationDate,
          }),
        },
        {
          'set-cookie':
            await invitationCookieStorage.destroySession(invitationCookie),
        },
        { 'set-cookie': await destroyUaPartnerContext(request) },
        { 'set-cookie': await setMembershipId(membership.id) }
      ),
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
  const isUa = data.partner === 'ua';

  const showClassSelect = !isUa && data.classes.length > 1;

  const form = useForm({
    schema: isUa ? UaSchema : GenericSchema,
    method: 'POST',
    submitSource: 'state',
    defaultValues: {
      name: '',
      classId: isUa ? '' : showClassSelect ? '' : data.classes[0]!.id,
      password: '',
      confirmPassword: '',
    },
  });

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mt-8 flex flex-col gap-3 text-center">
        <h1>Let's get started!</h1>
        <p className="text-sm text-muted-foreground">
          {isUa
            ? 'Create your account.'
            : 'Create your account and join your class.'}
        </p>
      </div>

      <div className="mx-auto mt-10 w-full max-w-md px-8">
        <Form
          method="POST"
          className="flex flex-col gap-4"
          {...form.getFormProps()}
        >
          <FormInput
            scope={form.scope('name')}
            type="text"
            label="Name"
            autoFocus
          />
          {showClassSelect ? (
            <FormSelect
              scope={form.scope('classId')}
              label="Class"
              options={[
                { value: '', label: 'Select a class' },
                ...data.classes.map((klass) => ({
                  value: klass.id,
                  label: `${klass.school.name} • ${klass.schoolYear}${
                    formatClassGradePeriod(klass)
                      ? ` • ${formatClassGradePeriod(klass)}`
                      : ''
                  } • ${
                    klass.teachers
                      .map((t) => t.user.name)
                      .filter(Boolean)
                      .join(', ') || 'Teacher'
                  }`,
                })),
              ]}
            />
          ) : !isUa ? (
            <input type="hidden" name="classId" value={data.classes[0]!.id} />
          ) : null}

          <FormInput
            scope={form.scope('password')}
            type="password"
            label="Password"
          />
          <FormInput
            scope={form.scope('confirmPassword')}
            type="password"
            label="Confirm Password"
          />
          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create account'}
          </Button>
        </Form>
      </div>
    </div>
  );
}
