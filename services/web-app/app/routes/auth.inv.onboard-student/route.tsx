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
import { setProfileId } from '~/cookies/profile-id.server.ts';
import { cn } from '~/utils/misc';
import { useEffect } from 'react';

export const Schema = z
  .object({
    name: NameSchema,
    schoolYear: z.string().min(1),
    teacherId: z.string().min(1),
    grade: z.string().min(1),
    period: z.string().min(1),
  })
  .and(PasswordAndConfirmPasswordSchema);

async function requireInvitation(request: Request) {
  const invitation = await invitationCookieStorage.getSession(
    request.headers.get('cookie')
  );
  const email = invitation.get('email');
  const schoolId = invitation.get('schoolId');
  const klassId = invitation.get('klassId');

  if (!email || !(schoolId || klassId)) {
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

  return { email, schoolId, klassId };
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnonymous(request);
  const { email, schoolId, klassId } = await requireInvitation(request);

  const classes = await prisma.class.findMany({
    where: {
      OR: [{ schoolId }, { id: klassId }],
      isArchived: false,
    },
    select: {
      id: true,
      schoolId: true,
      schoolYear: true,
      period: true,
      grade: true,
      teachers: {
        select: {
          id: true,
          profile: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });

  return { email, classes };
}

export async function action({ request }: ActionFunctionArgs) {
  const { email, schoolId, klassId } = await requireInvitation(request);
  const { data, error } = await parseFormData(request, Schema);
  if (error) return validationError(error);

  const hashedPassword = await getPasswordHash(data.password);
  const klass = await prisma.class.findFirst({
    where: {
      OR: [{ schoolId }, { id: klassId }],
      isArchived: false,
      schoolYear: data.schoolYear,
      grade: data.grade,
      period: data.period,
      teachers: { some: { id: data.teacherId } },
    },
    include: { school: true },
  });

  if (!klass) {
    return validationError({ fieldErrors: { name: 'Class not found' } });
  }

  const profile = await prisma.profile.create({
    data: {
      user: {
        create: {
          email,
          name: data.name,
          password: { create: { hash: hashedPassword } },
        },
      },
      organization: { connect: { id: klass.school.organizationId } },
      studentProfile: { create: { classes: { connect: { id: klass.id } } } },
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

  const schoolYearOptions = Array.from(
    new Set(data.classes.flatMap((klass) => klass.schoolYear))
  );

  const teacherOptions = Array.from(
    new Set(data.classes.flatMap((klass) => klass.teachers).map((t) => t.id))
  ).map(
    (id) => data.classes.flatMap((k) => k.teachers).find((t) => t.id === id)!
  );

  const showSchoolYearSelect = schoolYearOptions.length > 1;
  const showTeacherSelect = teacherOptions.length > 1;

  const form = useForm({
    schema: Schema,
    method: 'POST',
    submitSource: 'state',
    defaultValues: {
      name: '',
      schoolYear: showSchoolYearSelect ? '<select>' : schoolYearOptions[0],
      teacherId: showTeacherSelect ? '<select>' : teacherOptions[0].id,
      grade: '<select>',
      period: '<select>',
      password: '',
      confirmPassword: '',
    },
  });

  // Watch form values for dynamic filtering
  const selectedSchoolYear = form.value('schoolYear');
  const selectedTeacherId = form.value('teacherId');
  const selectedGrade = form.value('grade');
  const selectedPeriod = form.value('period');

  // Filter classes based on selected teacher and school year
  const filteredClasses = data.classes.filter((klass) => {
    const matchesSchoolYear =
      selectedSchoolYear === '<select>' ||
      klass.schoolYear === selectedSchoolYear;
    const matchesTeacher =
      selectedTeacherId === '<select>' ||
      klass.teachers.some((t) => t.id === selectedTeacherId);
    return matchesSchoolYear && matchesTeacher;
  });

  const gradeOptions = Array.from(
    new Set(filteredClasses.map((klass) => klass.grade))
  );

  const periodOptions = Array.from(
    new Set(filteredClasses.map((klass) => klass.period))
  );

  const showGradeSelect = gradeOptions.length > 1;
  const showPeriodSelect = periodOptions.length > 1;
  const canSelectGradeOrPeriod = selectedTeacherId !== '<select>';

  // Auto-fill grade and period when there's only one option
  useEffect(() => {
    if (canSelectGradeOrPeriod) {
      // Set grade if only one option and not already set
      if (gradeOptions.length === 1 && selectedGrade === '<select>') {
        form.setValue('grade', gradeOptions[0]);
      }
      // Set period if only one option and not already set
      if (periodOptions.length === 1 && selectedPeriod === '<select>') {
        form.setValue('period', periodOptions[0]);
      }
      // Reset if current selection is no longer valid
      if (gradeOptions.length > 0 && !gradeOptions.includes(selectedGrade)) {
        form.setValue(
          'grade',
          gradeOptions.length === 1 ? gradeOptions[0] : '<select>'
        );
      }
      if (periodOptions.length > 0 && !periodOptions.includes(selectedPeriod)) {
        form.setValue(
          'period',
          periodOptions.length === 1 ? periodOptions[0] : '<select>'
        );
      }
    } else {
      // Reset grade and period when teacher is not selected
      if (selectedGrade !== '<select>') form.setValue('grade', '<select>');
      if (selectedPeriod !== '<select>') form.setValue('period', '<select>');
    }
  }, [
    canSelectGradeOrPeriod,
    gradeOptions.join(','),
    periodOptions.join(','),
    selectedGrade,
    selectedPeriod,
  ]);

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
        <div
          className={
            'flex gap-3 ' +
            cn(showSchoolYearSelect || showTeacherSelect ? '' : 'hidden')
          }
        >
          <FormSelect
            scope={form.scope('schoolYear')}
            label="School Year"
            autoComplete="school-year"
            options={[
              { value: '<select>', label: 'Select a school year' },
              ...schoolYearOptions.map((schoolYear) => ({
                value: schoolYear,
                label: schoolYear,
              })),
            ]}
            className={cn('w-full', showSchoolYearSelect ? '' : 'hidden')}
          />
          <FormSelect
            scope={form.scope('teacherId')}
            label="Teacher"
            autoComplete="teacher"
            options={[
              { value: '<select>', label: 'Select a teacher' },
              ...teacherOptions.map((teacher) => ({
                value: teacher.id,
                label: teacher.profile.user.name,
              })),
            ]}
            className={cn('w-full', showTeacherSelect ? '' : 'hidden')}
          />
        </div>
        <div
          className={
            'flex gap-3 ' +
            cn(
              canSelectGradeOrPeriod && (showGradeSelect || showPeriodSelect)
                ? ''
                : 'hidden'
            )
          }
        >
          <FormSelect
            scope={form.scope('grade')}
            label="Grade"
            autoComplete="grade"
            className={cn('w-full', showGradeSelect ? '' : 'hidden')}
            disabled={!canSelectGradeOrPeriod}
            options={[
              {
                value: '<select>',
                label: canSelectGradeOrPeriod
                  ? 'Select a grade'
                  : 'Select teacher first',
              },
              ...gradeOptions.map((grade) => ({
                value: grade,
                label: grade,
              })),
            ]}
          />
          <FormSelect
            scope={form.scope('period')}
            label="Period"
            autoComplete="period"
            className={cn('w-full', showPeriodSelect ? '' : 'hidden')}
            disabled={!canSelectGradeOrPeriod}
            options={[
              {
                value: '<select>',
                label: canSelectGradeOrPeriod
                  ? 'Select a period'
                  : 'Select teacher first',
              },
              ...periodOptions.map((period) => ({
                value: period,
                label: period,
              })),
            ]}
          />
        </div>
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
