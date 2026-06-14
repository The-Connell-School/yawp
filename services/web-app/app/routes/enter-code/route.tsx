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
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { Button } from '~/components/ui/button';
import { FormInput } from '~/components/rvf-forms/form-input';
import { FormSelect } from '~/components/rvf-forms/form-select';
import { redirectWithToast } from '~/utils/toast.server';
import { getStudentPreviewState } from '~/utils/student-preview.server';
import { EnterCodeEscapeActions } from './escape-actions';

const CodeSchema = z.object({
  code: z.string().min(1, 'Code is required'),
});

const ClassSelectionSchema = z.object({
  classId: z.string().min(1, 'Class is required'),
});

async function connectMembershipToClass(membershipId: string, classId: string) {
  await prisma.orgMembership.update({
    where: { id: membershipId },
    data: { classesAsStudent: { connect: { id: classId } } },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  const preview = await getStudentPreviewState(request);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return data({
      membership,
      classes: [],
      code: null,
      studentPreviewActive: preview.active,
    });
  }

  const classes = await prisma.class.findMany({
    where: {
      isArchived: false,
      code: { equals: code, mode: 'insensitive' },
    },
    select: {
      id: true,
      code: true,
      schoolYear: true,
      period: true,
      grade: true,
      school: { select: { name: true } },
      teachers: {
        select: {
          user: { select: { name: true } },
        },
      },
    },
    orderBy: [
      { schoolYear: 'desc' },
      { grade: 'asc' },
      { period: 'asc' },
    ],
  });

  return data({
    membership,
    classes,
    code,
    studentPreviewActive: preview.active,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'validate-code') {
    const { error, data: codeData } = await parseFormData(formData, CodeSchema);
    if (error) return validationError(error);

    const classes = await prisma.class.findMany({
      where: {
        isArchived: false,
        code: { equals: codeData.code, mode: 'insensitive' },
      },
      select: { id: true },
      take: 20,
    });

    if (classes.length === 0) {
      return validationError({ fieldErrors: { code: 'Invalid code.' } });
    }

    if (classes.length === 1) {
      await connectMembershipToClass(membership.id, classes[0]!.id);

      return redirectWithToast('/app', {
        title: 'Success',
        description: 'You have been added to the class!',
      });
    }

    const url = new URL(request.url);
    url.searchParams.set('code', codeData.code.trim());
    return redirect(url.toString());
  }

  if (intent === 'assign-class') {
    const { error, data: selectionData } = await parseFormData(
      formData,
      ClassSelectionSchema
    );
    if (error) return validationError(error);

    const klass = await prisma.class.findFirst({
      where: {
        id: selectionData.classId,
        isArchived: false,
      },
      select: { id: true },
    });

    if (!klass) {
      return validationError({ fieldErrors: { classId: 'Class not found' } });
    }

    await connectMembershipToClass(membership.id, klass.id);

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
  const hasCode = !!searchParams.get('code');

  if (!hasCode) {
    const codeForm = useForm({
      schema: CodeSchema,
      method: 'POST',
      defaultValues: { code: '' },
    });

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-3 text-center mb-8">
            <h1 className="text-2xl font-bold">Enter Your Class Code</h1>
            <p className="text-sm text-muted-foreground">
              Enter your class code to get started
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
              label="Class Code"
              autoFocus
            />
            <Button className="w-full" type="submit" disabled={isLoading}>
              Continue
            </Button>
          </Form>
          <EnterCodeEscapeActions
            studentPreviewActive={data.studentPreviewActive}
          />
        </div>
      </div>
    );
  }

  const classForm = useForm({
    schema: ClassSelectionSchema,
    method: 'POST',
    defaultValues: { classId: '' },
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-lg">
        <div className="flex flex-col gap-3 text-center mb-8">
          <h1 className="text-2xl font-bold">Select Your Class</h1>
          <p className="text-sm text-muted-foreground">
            Multiple classes use this code. Please select your class.
          </p>
        </div>
        <Form
          method="POST"
          className="flex flex-col gap-4"
          {...classForm.getFormProps()}
        >
          <input type="hidden" name="intent" value="assign-class" />
          <FormSelect
            scope={classForm.scope('classId')}
            label="Class"
            options={[
              { value: '', label: 'Select a class' },
              ...data.classes.map((klass) => ({
                value: klass.id,
                label: `${klass.school.name} • ${klass.schoolYear} • Grade ${klass.grade} • Period ${klass.period} • ${
                  klass.teachers
                    .map((t) => t.user.name)
                    .filter(Boolean)
                    .join(', ') || 'Teacher'
                }`,
              })),
            ]}
          />
          <Button className="w-full" type="submit" disabled={isLoading}>
            Join Class
          </Button>
        </Form>
        <EnterCodeEscapeActions studentPreviewActive={data.studentPreviewActive} />
      </div>
    </div>
  );
}
