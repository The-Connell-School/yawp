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
import { formatClassGradePeriod } from '~/utils/class-display';
import { enrollStudentInClassWithSeatCap } from '~/domain/free-tier/class-seat-cap.server';
import { FREE_CLASS_CLASS_FULL_MESSAGE } from '~/domain/free-tier/class-seat-cap';

const CodeSchema = z.object({
  code: z.string().min(1, 'Code is required'),
});

// The second step carries the code that was validated in the first one. Picking a class
// is a disambiguation, not an authorization: the code still has to be re-checked, or
// `assign-class` becomes a way to enroll in any class without ever knowing a code.
const ClassSelectionSchema = z.object({
  classId: z.string().min(1, 'Class is required'),
  code: z.string().min(1, 'Code is required'),
});

/**
 * Every class lookup on this route runs through here.
 *
 * `Class.code` is unique per school (`@@unique([schoolId, code])`), not globally, so a
 * bare code match spans organizations and a collision would enroll a student into
 * another tenant's class. A student only reaches this page from `/app`, already holding
 * a membership, so the organization that membership belongs to is the right scope: it
 * still allows the legitimate ambiguity of two schools inside one organization sharing a
 * code, which is what the selection step exists for.
 */
function classCodeWhere(organizationId: string, code: string) {
  return {
    isArchived: false,
    code: { equals: code, mode: 'insensitive' as const },
    school: { organizationId },
  };
}

function requireStudentMembership(membership: { role: string }) {
  if (membership.role !== 'STUDENT') {
    throw Response.json(
      { error: 'Forbidden', message: 'A student membership is required.' },
      { status: 403 }
    );
  }
}

async function connectMembershipToClass(
  membershipId: string,
  classId: string,
  organizationId: string
) {
  const result = await enrollStudentInClassWithSeatCap({
    membershipId,
    classId,
    organizationId,
  });
  if (!result.ok) {
    return result;
  }
  return { ok: true as const };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  requireStudentMembership(membership);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return data({
      membership,
      classes: [],
      code: null,
    });
  }

  const classes = await prisma.class.findMany({
    where: classCodeWhere(membership.organization.id, code),
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
    orderBy: [{ schoolYear: 'desc' }, { grade: 'asc' }, { period: 'asc' }],
  });

  return data({
    membership,
    classes,
    code,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  requireStudentMembership(membership);
  const formData = await request.formData();
  const intent = formData.get('intent');
  const isModal = new URL(request.url).searchParams.get('modal') === '1';

  if (intent === 'validate-code') {
    const { error, data: codeData } = await parseFormData(formData, CodeSchema);
    if (error) return validationError(error);

    const classes = await prisma.class.findMany({
      where: classCodeWhere(membership.organization.id, codeData.code),
      select: {
        id: true,
        schoolYear: true,
        period: true,
        grade: true,
        school: { select: { name: true } },
        teachers: { select: { user: { select: { name: true } } } },
      },
      orderBy: [{ schoolYear: 'desc' }, { grade: 'asc' }, { period: 'asc' }],
    });

    if (classes.length === 0) {
      return validationError({ fieldErrors: { code: 'Invalid code.' } });
    }

    if (classes.length === 1) {
      const enrolled = await connectMembershipToClass(
        membership.id,
        classes[0]!.id,
        membership.organization.id
      );
      if (!enrolled.ok) {
        const message =
          enrolled.code === 'class_full'
            ? FREE_CLASS_CLASS_FULL_MESSAGE
            : enrolled.error;
        return validationError({ fieldErrors: { code: message } });
      }

      if (isModal) return data({ status: 'enrolled' as const });

      return redirectWithToast('/app', {
        title: 'Success',
        description: 'You have been added to the class!',
      });
    }

    if (isModal) {
      return data({
        status: 'select' as const,
        code: codeData.code.trim(),
        classes: classes.map((klass) => ({
          id: klass.id,
          label: `${klass.school.name} • ${klass.schoolYear}${
            formatClassGradePeriod(klass)
              ? ` • ${formatClassGradePeriod(klass)}`
              : ''
          } • ${
            klass.teachers
              .map((teacher) => teacher.user.name)
              .filter(Boolean)
              .join(', ') || 'Teacher'
          }`,
        })),
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
        ...classCodeWhere(membership.organization.id, selectionData.code),
      },
      select: { id: true },
    });

    if (!klass) {
      return validationError({ fieldErrors: { classId: 'Class not found' } });
    }

    const enrolled = await connectMembershipToClass(
      membership.id,
      klass.id,
      membership.organization.id
    );
    if (!enrolled.ok) {
      const message =
        enrolled.code === 'class_full'
          ? FREE_CLASS_CLASS_FULL_MESSAGE
          : enrolled.error;
      return validationError({ fieldErrors: { classId: message } });
    }

    if (isModal) return data({ status: 'enrolled' as const });

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
  const validatedCode = searchParams.get('code') ?? '';
  const hasCode = !!validatedCode;

  // Both forms are built on every render. Step one navigates to step two on the client,
  // so calling either hook conditionally changes the hook order between renders of the
  // same component instance and the selection screen renders as the error boundary.
  const codeForm = useForm({
    schema: CodeSchema,
    method: 'POST',
    defaultValues: { code: '' },
  });

  const classForm = useForm({
    schema: ClassSelectionSchema,
    method: 'POST',
    defaultValues: { classId: '', code: validatedCode },
  });

  if (!hasCode) {
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
          <Form method="POST" action="/auth/logout" className="mt-3">
            <Button variant="outline" className="w-full" type="submit">
              Log out
            </Button>
          </Form>
        </div>
      </div>
    );
  }

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
          {/* The code validated in step one; the action re-checks it against the
              chosen class rather than trusting the class id on its own. */}
          <input type="hidden" name="code" value={validatedCode} />
          <FormSelect
            scope={classForm.scope('classId')}
            label="Class"
            // Radix rejects a Select.Item whose value is the empty string, so the
            // "Select a class" row is a placeholder, not an option.
            placeholder="Select a class"
            options={[
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
          <Button className="w-full" type="submit" disabled={isLoading}>
            Join Class
          </Button>
        </Form>
        <Form method="POST" action="/auth/logout" className="mt-3">
          <Button variant="outline" className="w-full" type="submit">
            Log out
          </Button>
        </Form>
      </div>
    </div>
  );
}
