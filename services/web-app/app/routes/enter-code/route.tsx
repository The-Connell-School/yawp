import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useNavigation,
  redirect,
  data,
} from 'react-router';
import { Form, useLoaderData, useSearchParams } from 'react-router';
import { z } from 'zod';
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { Button } from '~/components/ui/button';
import { FormInput } from '~/components/rvf-forms/form-input';
import { FormSelect } from '~/components/rvf-forms/form-select';
import { redirectWithToast } from '~/utils/toast.server';
import { cn } from '~/utils/misc';
import { useEffect } from 'react';

const CodeSchema = z.object({
  code: z.string().min(1, 'Code is required'),
});

const ClassSelectionSchema = z.object({
  schoolYear: z.string().min(1),
  teacherId: z.string().min(1),
  grade: z.string().min(1),
  period: z.string().min(1),
  schoolId: z.string().optional(),
  klassId: z.string().optional(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const schoolId = url.searchParams.get('schoolId');
  const klassId = url.searchParams.get('klassId');

  const profile = await prisma.profile.findFirst({
    where: { userId },
    select: { id: true, organizationId: true },
  });

  if (!profile) {
    throw new Error('Profile not found');
  }

  // If we have schoolId or klassId, fetch available classes
  if (schoolId || klassId) {
    const whereConditions = [];
    if (schoolId) whereConditions.push({ schoolId });
    if (klassId) whereConditions.push({ id: klassId });

    const classes = await prisma.class.findMany({
      where: {
        OR: whereConditions,
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

    return data({ profile, classes, schoolId, klassId });
  }

  return data({ profile, classes: [], schoolId: null, klassId: null });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  const profile = await prisma.profile.findFirst({
    where: { userId },
    select: { id: true, organizationId: true },
  });

  if (!profile) {
    throw new Error('Profile not found');
  }

  // Step 1: Validate code
  if (intent === 'validate-code') {
    const { error, data: codeData } = await parseFormData(formData, CodeSchema);
    if (error) return validationError(error);

    const [school, klass] = await Promise.all([
      prisma.school.findFirst({
        where: { code: codeData.code },
      }),
      prisma.class.findFirst({
        where: { code: codeData.code },
      }),
    ]);

    if (!school && !klass) {
      return validationError({ fieldErrors: { code: 'Invalid code.' } });
    }

    // Fetch classes to check if selection is needed
    const classes = await prisma.class.findMany({
      where: {
        OR: [{ schoolId: school?.id }, { id: klass?.id }],
        isArchived: false,
      },
      select: {
        id: true,
        schoolYear: true,
        period: true,
        grade: true,
        teachers: { select: { id: true } },
      },
    });

    const schoolYearOptions = Array.from(
      new Set(classes.map((c) => c.schoolYear))
    );
    const teacherOptions = Array.from(
      new Set(classes.flatMap((c) => c.teachers).map((t) => t.id))
    );
    const gradeOptions = Array.from(new Set(classes.map((c) => c.grade)));
    const periodOptions = Array.from(new Set(classes.map((c) => c.period)));

    // If only one class matches all criteria, assign it directly
    if (
      schoolYearOptions.length === 1 &&
      teacherOptions.length === 1 &&
      gradeOptions.length === 1 &&
      periodOptions.length === 1 &&
      classes.length === 1
    ) {
      const studentProfile = await prisma.studentProfile.findFirst({
        where: { profileId: profile.id },
      });

      if (!studentProfile) {
        await prisma.studentProfile.create({
          data: {
            profileId: profile.id,
            classes: { connect: { id: classes[0].id } },
          },
        });
      } else {
        await prisma.studentProfile.update({
          where: { id: studentProfile.id },
          data: {
            classes: { connect: { id: classes[0].id } },
          },
        });
      }

      return redirectWithToast('/app', {
        title: 'Success',
        description: 'You have been added to the class!',
      });
    }

    // Otherwise, redirect to selection page
    const url = new URL(request.url);
    if (school) url.searchParams.set('schoolId', school.id);
    if (klass) url.searchParams.set('klassId', klass.id);
    return redirect(url.toString());
  }

  // Step 2: Assign class
  if (intent === 'assign-class') {
    const { error, data: selectionData } = await parseFormData(
      formData,
      ClassSelectionSchema
    );
    if (error) return validationError(error);

    const klass = await prisma.class.findFirst({
      where: {
        OR: [
          { schoolId: selectionData.schoolId },
          { id: selectionData.klassId },
        ],
        isArchived: false,
        schoolYear: selectionData.schoolYear,
        grade: selectionData.grade,
        period: selectionData.period,
        teachers: { some: { id: selectionData.teacherId } },
      },
    });

    if (!klass) {
      return validationError({ fieldErrors: { grade: 'Class not found' } });
    }

    const studentProfile = await prisma.studentProfile.findFirst({
      where: { profileId: profile.id },
    });

    if (!studentProfile) {
      await prisma.studentProfile.create({
        data: {
          profileId: profile.id,
          classes: { connect: { id: klass.id } },
        },
      });
    } else {
      await prisma.studentProfile.update({
        where: { id: studentProfile.id },
        data: {
          classes: { connect: { id: klass.id } },
        },
      });
    }

    return redirectWithToast('/app', {
      title: 'Success',
      description: 'You have been added to the class!',
    });
  }

  return null;
}

export default function Route() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';
  const [searchParams] = useSearchParams();

  const showingCodeForm =
    !searchParams.get('schoolId') && !searchParams.get('klassId');

  // Code entry form
  if (showingCodeForm) {
    const codeForm = useForm({
      schema: CodeSchema,
      method: 'POST',
      defaultValues: { code: '' },
    });

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-3 text-center mb-8">
            <h1 className="text-2xl font-bold">Enter Your Code</h1>
            <p className="text-sm text-muted-foreground">
              Enter your school or class code to get started
            </p>
          </div>
          <Form
            method="POST"
            className="flex flex-col gap-4"
            {...codeForm.getFormProps()}
          >
            <input type="hidden" name="intent" value="validate-code" />
            <FormInput
              scope={codeForm.scope('code')}
              type="text"
              label="Code"
              autoFocus
            />
            <Button className="w-full" type="submit" disabled={isLoading}>
              Continue
            </Button>
          </Form>
        </div>
      </div>
    );
  }

  // Class selection form
  const schoolYearOptions = Array.from(
    new Set(data.classes.map((klass) => klass.schoolYear))
  );

  const teacherOptions = Array.from(
    new Set(data.classes.flatMap((klass) => klass.teachers).map((t) => t.id))
  ).map(
    (id) => data.classes.flatMap((k) => k.teachers).find((t) => t.id === id)!
  );

  const showSchoolYearSelect = schoolYearOptions.length > 1;
  const showTeacherSelect = teacherOptions.length > 1;

  const classForm = useForm({
    schema: ClassSelectionSchema,
    method: 'POST',
    defaultValues: {
      schoolYear: showSchoolYearSelect ? '<select>' : schoolYearOptions[0],
      teacherId: showTeacherSelect ? '<select>' : teacherOptions[0].id,
      grade: '<select>',
      period: '<select>',
      schoolId: data.schoolId || undefined,
      klassId: data.klassId || undefined,
    },
  });

  // Watch form values for dynamic filtering
  const selectedSchoolYear = classForm.value('schoolYear');
  const selectedTeacherId = classForm.value('teacherId');

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

  // Auto-fill grade and period when teacher is selected and there's only one option
  useEffect(() => {
    if (canSelectGradeOrPeriod) {
      if (gradeOptions.length === 1) {
        classForm.setValue('grade', gradeOptions[0]);
      }
      if (periodOptions.length === 1) {
        classForm.setValue('period', periodOptions[0]);
      }
    } else {
      // Reset grade and period when teacher is not selected
      classForm.setValue('grade', '<select>');
      classForm.setValue('period', '<select>');
    }
  }, [canSelectGradeOrPeriod, gradeOptions, periodOptions]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-lg">
        <div className="flex flex-col gap-3 text-center mb-8">
          <h1 className="text-2xl font-bold">Select Your Class</h1>
          <p className="text-sm text-muted-foreground">
            Please select your class details
          </p>
        </div>
        <Form
          method="POST"
          className="flex flex-col gap-4"
          {...classForm.getFormProps()}
        >
          <input type="hidden" name="intent" value="assign-class" />
          <input type="hidden" name="schoolId" value={data.schoolId || ''} />
          <input type="hidden" name="klassId" value={data.klassId || ''} />

          <div
            className={cn(
              'flex gap-3',
              showSchoolYearSelect || showTeacherSelect ? '' : 'hidden'
            )}
          >
            <FormSelect
              scope={classForm.scope('schoolYear')}
              label="School Year"
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
              scope={classForm.scope('teacherId')}
              label="Teacher"
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
            className={cn(
              'flex gap-3',
              canSelectGradeOrPeriod && (showGradeSelect || showPeriodSelect)
                ? ''
                : 'hidden'
            )}
          >
            <FormSelect
              scope={classForm.scope('grade')}
              label="Grade"
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
              scope={classForm.scope('period')}
              label="Period"
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

          <Button className="w-full" type="submit" disabled={isLoading}>
            Join Class
          </Button>
        </Form>
      </div>
    </div>
  );
}
