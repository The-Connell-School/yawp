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
import { Grade, Period } from '~/utils/enums.js';
import {
  NameSchema,
  PasswordAndConfirmPasswordSchema,
} from '~/utils/schemas/user.ts';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server.ts';
import { redirectWithToast } from '~/utils/toast.server.ts';
import { invitationCookieStorage } from '~/cookie-session-storages/invitation.server';
import { parseFormData, useForm } from '@rvf/react-router';
import { validationError } from '@rvf/react-router';
import { FormInput } from '~/components/rvf-forms/form-input.tsx';
import { FormSelect } from '~/components/rvf-forms/form-select.tsx';
import { setProfileId } from '~/cookies/profile-id.server.ts';

const FullSchema = z
  .object({
    name: NameSchema,
    teacherId: z.string().refine((value) => value !== '<select>', {
      message: 'Please select a teacher',
    }),
    grade: z.string().refine((value) => value !== '<select>', {
      message: 'Please select a grade',
    }),
    period: z.string().refine((value) => value !== '<select>', {
      message: 'Please select a period',
    }),
  })
  .and(PasswordAndConfirmPasswordSchema);

const MinimalSchema = z
  .object({ name: NameSchema })
  .and(PasswordAndConfirmPasswordSchema);

async function requireInvitation(request: Request) {
  const invitation = await invitationCookieStorage.getSession(
    request.headers.get('cookie')
  );
  const email = invitation.get('email');
  const schoolId = invitation.get('schoolId');
  const classCode = invitation.get('classCode') as string | undefined;

  if (!email || !schoolId) {
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

  return { email, schoolId, classCode };
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  const { email, schoolId, classCode } = await requireInvitation(request);

  let klass: { id: string; code: string | null } | null = null;
  if (classCode) {
    klass = await prisma.class.findFirst({
      where: { code: classCode.toUpperCase(), schoolId },
      select: { id: true, code: true },
    });
  }

  const teachers = await prisma.teacherProfile.findMany({
    where: { schools: { some: { id: schoolId } } },
    select: {
      id: true,
      profile: { select: { user: { select: { name: true } } } },
    },
  });

  return {
    email,
    schoolId,
    teachers,
    classCode: klass?.code ?? null,
    classId: klass?.id ?? null,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { email, schoolId, classCode } = await requireInvitation(request);

  const useMinimal = !!classCode;
  const { data, error } = await parseFormData(
    request,
    useMinimal ? MinimalSchema : FullSchema
  );
  if (error) return validationError(error);

  const hashedPassword = await getPasswordHash((data as any).password);

  let organizationId;
  try {
    const school = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
    });
    organizationId = school.organizationId;
  } catch (error) {
    return validationError({ fieldErrors: { schoolId: 'School not found' } });
  }

  if (!organizationId) {
    return validationError({ fieldErrors: { schoolId: 'School not found' } });
  }

  let classConnect:
    | { connect: { id: string } }
    | {
        connectOrCreate: {
          where: {
            schoolId_period_grade: {
              schoolId: string;
              period: string;
              grade: string;
            };
          };
          create: {
            grade: string;
            period: string;
            school: { connect: { id: string } };
            teachers: { connect: { id: string } };
          };
        };
      };

  if (classCode) {
    const klass = await prisma.class.findFirst({
      where: { code: classCode.toUpperCase(), schoolId },
      select: { id: true },
    });
    if (!klass)
      return validationError({ fieldErrors: { classCode: 'Class not found' } });
    classConnect = { connect: { id: klass.id } };
  } else {
    classConnect = {
      connectOrCreate: {
        where: {
          schoolId_period_grade: {
            schoolId,
            period: (data as any).period,
            grade: (data as any).grade,
          },
        },
        create: {
          grade: (data as any).grade,
          period: (data as any).period,
          school: { connect: { id: schoolId } },
          teachers: { connect: { id: (data as any).teacherId } },
        },
      },
    } as const;
  }

  const profile = await prisma.profile.create({
    data: {
      user: {
        create: {
          email,
          name: (data as any).name,
          password: { create: { hash: hashedPassword } },
        },
      },
      organization: { connect: { id: organizationId } },
      studentProfile: {
        create: {
          class: classConnect as any,
        },
      },
    },
  });

  const session = await prisma.session.create({
    data: {
      expirationDate: getSessionExpirationDate(),
      user: { connect: { id: profile.userId } },
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
          await setProfileId(profile.id),
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
    schema: data.classCode ? MinimalSchema : FullSchema,
    method: 'POST',
    defaultValues: data.classCode
      ? {
          name: '',
          password: '',
          confirmPassword: '',
        }
      : {
          name: '',
          teacherId: '<select>',
          grade: '<select>',
          period: '<select>',
          password: '',
          confirmPassword: '',
        },
  });

  return (
    <div className="mx-auto w-full max-w-lg px-2 py-20">
      <div className="flex flex-col gap-3 text-center">
        <h1>Welcome, {data.email}!</h1>
        {data.classCode ? (
          <p>
            You're joining class code {data.classCode}. Finish creating your
            account.
          </p>
        ) : (
          <p>Please enter your details.</p>
        )}
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
        {data.classCode ? null : (
          <>
            <FormSelect
              scope={form.scope('teacherId')}
              label="Teacher"
              autoComplete="teacher"
              options={[
                { value: '<select>', label: 'Select a teacher' },
                ...data.teachers.map((teacher) => ({
                  value: teacher.id,
                  label: teacher.profile.user.name,
                })),
              ]}
            />
            <div className="flex gap-3">
              <FormSelect
                scope={form.scope('grade')}
                label="Grade"
                autoComplete="grade"
                className="w-full"
                options={[
                  { value: '<select>', label: 'Select a grade' },
                  ...Object.values(Grade).map((grade) => ({
                    value: grade,
                    label: grade,
                  })),
                ]}
              />
              <FormSelect
                scope={form.scope('period')}
                label="Period"
                autoComplete="period"
                className="w-full"
                options={[
                  { value: '<select>', label: 'Select a period' },
                  ...Object.values(Period).map((period) => ({
                    value: period,
                    label: period,
                  })),
                ]}
              />
            </div>
          </>
        )}
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
