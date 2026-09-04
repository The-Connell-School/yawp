import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
  Form,
  redirect,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { FormSelect } from '~/components/rvf-forms/form-select.tsx';
import { Button } from '~/components/ui/button.tsx';
import { invitationCookieStorage } from '~/cookie-session-storages/invitation.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { clearSchoolYearScope } from '~/cookies/school-year.server';
import { requireUserId } from '~/utils/auth.server.ts';
import { prisma } from '~/utils/db.server.ts';
import { combineHeaders } from '~/utils/misc';
import { normalizeEmail } from '~/utils/normalize-email';
import { redirectWithToast } from '~/utils/toast.server.ts';

const Schema = z.object({
  schoolId: z.string().min(1, 'School is required'),
});

async function requireInvitation(request: Request) {
  const invitation = await invitationCookieStorage.getSession(
    request.headers.get('cookie')
  );
  const rawEmail = invitation.get('email') as string | undefined;
  const email = rawEmail ? normalizeEmail(rawEmail) : undefined;
  const organizationId = invitation.get('organizationId') as
    | string
    | undefined;

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

  return { email, organizationId, invitation };
}

async function requireInvitationUser(userId: string, email: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user?.email || normalizeEmail(user.email) !== email) {
    throw redirect('/auth/login');
  }
}

async function assertSchoolInOrganization(
  schoolId: string,
  organizationId: string
) {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, organizationId },
    select: { id: true },
  });
  if (!school) {
    return validationError({
      fieldErrors: { schoolId: 'Choose a school from this organization.' },
    });
  }
  return null;
}

async function acceptTeacherInvitation(params: {
  userId: string;
  organizationId: string;
  schoolId: string;
}) {
  const { userId, organizationId, schoolId } = params;
  const membership = await prisma.orgMembership.findFirst({
    where: { userId, organizationId },
    select: {
      id: true,
      role: true,
      schools: { select: { id: true } },
    },
  });

  if (
    membership &&
    membership.role === 'TEACHER' &&
    membership.schools.length > 0
  ) {
    return membership.id;
  }

  if (membership) {
    const updated = await prisma.orgMembership.update({
      where: { id: membership.id },
      data: {
        role: 'TEACHER',
        schools: { connect: [{ id: schoolId }] },
      },
      select: { id: true },
    });
    return updated.id;
  }

  const created = await prisma.orgMembership.create({
    data: {
      user: { connect: { id: userId } },
      organization: { connect: { id: organizationId } },
      role: 'TEACHER',
      schools: { connect: [{ id: schoolId }] },
    },
    select: { id: true },
  });
  return created.id;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { email, organizationId } = await requireInvitation(request);
  const userId = await requireUserId(request);
  await requireInvitationUser(userId, email);
  const schools = await prisma.school.findMany({
    where: { organizationId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return { email, schools };
}

export async function action({ request }: ActionFunctionArgs) {
  const { email, organizationId, invitation } = await requireInvitation(request);
  const userId = await requireUserId(request);
  await requireInvitationUser(userId, email);

  const { data, error } = await parseFormData(request, Schema);
  if (error) return validationError(error);

  const schoolError = await assertSchoolInOrganization(
    data.schoolId,
    organizationId
  );
  if (schoolError) return schoolError;

  const membershipId = await acceptTeacherInvitation({
    userId,
    organizationId,
    schoolId: data.schoolId,
  });

  return redirectWithToast(
    '/app',
    {
      title: 'Invitation accepted',
      description:
        'You have successfully joined your organization as a teacher.',
    },
    {
      headers: combineHeaders(
        {
          'set-cookie':
            await invitationCookieStorage.destroySession(invitation),
        },
        { 'set-cookie': await setMembershipId(membershipId) },
        { 'set-cookie': await clearSchoolYearScope() }
      ),
    }
  );
}

export const meta: MetaFunction = () => [{ title: 'Select Your School' }];

export default function Route() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const form = useForm({
    schema: Schema,
    method: 'POST',
    defaultValues: { schoolId: '' },
  });

  return (
    <div className="mx-auto w-full max-w-xs rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 max-sm:w-[calc(100%-2rem)] sm:p-7">
      <div className="flex flex-col items-start gap-2 text-left">
        <h1 className="text-lg font-semibold">Select your school</h1>
        <p className="text-pretty text-base text-muted-foreground sm:text-sm">
          Choose the school you teach at for {data.email}.
        </p>
      </div>
      <Form
        method="POST"
        className="mt-6 flex flex-col gap-5"
        {...form.getFormProps()}
      >
        <FormSelect
          scope={form.scope('schoolId')}
          label="School"
          autoComplete="organization"
          options={data.schools.map((school) => ({
            value: school.id,
            label: school.name,
          }))}
        />
        <Button
          className="h-11 w-full text-base sm:h-10 sm:text-sm"
          type="submit"
          disabled={navigation.state !== 'idle'}
        >
          Continue
        </Button>
      </Form>
    </div>
  );
}
