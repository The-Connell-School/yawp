import { useEffect } from 'react';
import {
  Form,
  Link,
  data as dataResponse,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { CaretLeftIcon } from '~/components/icons';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { TeachingApprovalRequiredAlert } from '~/components/free-tier/teaching-approval-required-alert';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';
import { lockedTeachingButtonProps } from '~/components/free-tier/locked-teaching-control';
import { isTeachingApprovalRequiredActionData } from '~/domain/free-tier/teaching-approval-required';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import { formatClassCardTitle } from '~/utils/class-display';

async function assertPendingFreeTierInlineAssignmentRoute(userId: string) {
  const { isFreeTierEnabled } =
    await import('~/domain/feature-flags/feature-flags.server');
  const { userHasPendingFreeTierTeachingLock } =
    await import('~/domain/free-tier/locked-preview.server');
  if (!(await isFreeTierEnabled())) {
    throw new Response(null, { status: 404, statusText: 'Not Found' });
  }
  if (!(await userHasPendingFreeTierTeachingLock(userId))) {
    throw new Response(null, { status: 404, statusText: 'Not Found' });
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') throw redirect('/app');
  await assertPendingFreeTierInlineAssignmentRoute(userId);

  const url = new URL(request.url);
  const initialAssignmentTypeId = url.searchParams.get('assignmentTypeId') ?? '';
  const initialClassId = url.searchParams.get('classId') ?? '';

  const classes = await prisma.class.findMany({
    where: { teachers: { some: { id: profile.id } }, isArchived: false },
    select: {
      id: true,
      schoolId: true,
      grade: true,
      period: true,
      title: true,
      school: { select: { name: true } },
    },
    orderBy: [{ grade: 'asc' }, { period: 'asc' }],
  });

  const assignmentTypes =
    await getAvailableAssignmentTypesForScopes<{ id: string; title: string }>({
      scopes: [
        {
          organizationId: profile.organization.id,
          schoolId: classes[0]?.schoolId,
          teacherProfileId: profile.id,
        },
      ],
      select: { id: true, title: true },
      orderBy: { position: 'asc' },
    });

  return {
    assignmentTypes,
    classes: classes.map((klass) => ({
      id: klass.id,
      label: formatClassCardTitle(klass),
    })),
    defaults: {
      assignmentTypeId: initialAssignmentTypeId,
      classId: initialClassId,
    },
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') {
    return dataResponse({ error: 'Only teachers can create assignments.' }, { status: 403 });
  }

  await assertPendingFreeTierInlineAssignmentRoute(userId);

  const formData = await request.formData();
  const { guardTeachingFormAction } =
    await import('~/domain/free-tier/teaching-approval-required.server');
  const blocked = await guardTeachingFormAction(request, userId, formData);
  if (blocked) return blocked;

  return dataResponse(
    { error: 'Assignment creation is not available on this form yet.' },
    { status: 400 }
  );
}

type FormValues = {
  assignmentTypeId: string;
  title: string;
  classId: string;
  prompt: string;
};

function readFormValues(
  fields: Record<string, string | string[] | undefined> | undefined,
  defaults: FormValues
): FormValues {
  if (!fields) return defaults;
  const one = (key: string, fallback: string) => {
    const value = fields[key];
    if (typeof value === 'string') return value;
    return fallback;
  };
  return {
    assignmentTypeId: one('assignmentTypeId', defaults.assignmentTypeId),
    title: one('title', defaults.title),
    classId: one('classId', defaults.classId),
    prompt: one('prompt', defaults.prompt),
  };
}

export default function NewAssignmentPage() {
  const { assignmentTypes, classes, defaults } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { locked: teachingLocked, loading: teachingLoading } =
    useTeachingAccess();

  const approvalBlocked = isTeachingApprovalRequiredActionData(actionData);
  const values = readFormValues(
    approvalBlocked ? actionData.fields : undefined,
    {
      assignmentTypeId: defaults.assignmentTypeId,
      title: '',
      classId: defaults.classId || classes[0]?.id || '',
      prompt: '',
    }
  );

  const submitLocked =
    teachingLocked || teachingLoading || approvalBlocked;

  useEffect(() => {
    if (approvalBlocked) {
      document
        .querySelector<HTMLElement>('[data-testid="teaching-approval-required-alert"]')
        ?.focus();
    }
  }, [approvalBlocked]);

  return (
    <div className="mx-auto h-full min-h-0 w-full max-w-2xl overflow-y-auto px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/app/assignments" className="w-fit">
          <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to assignments
        </Link>
      </Button>
      <h1 className="mb-6 text-2xl font-semibold">New assignment</h1>
      <Form
        method="post"
        className="space-y-4 rounded-xl border bg-popover p-6"
        onSubmit={(event) => {
          if (submitLocked && !approvalBlocked) event.preventDefault();
        }}
      >
        {approvalBlocked ? <TeachingApprovalRequiredAlert /> : null}
        <div className="space-y-2">
          <Label htmlFor="assignmentTypeId">Assignment type</Label>
          <select
            id="assignmentTypeId"
            name="assignmentTypeId"
            required
            defaultValue={values.assignmentTypeId}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="" disabled>
              Select a type
            </option>
            {assignmentTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={values.title}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="classId">Class</Label>
          <select
            id="classId"
            name="classId"
            required
            defaultValue={values.classId}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt</Label>
          <Textarea
            id="prompt"
            name="prompt"
            required
            rows={5}
            defaultValue={values.prompt}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" asChild>
            <Link to="/app/assignments">Cancel</Link>
          </Button>
          <Button
            type="submit"
            disabled={navigation.state !== 'idle' && !approvalBlocked}
            {...lockedTeachingButtonProps(submitLocked)}
          >
            Create assignment
          </Button>
        </div>
      </Form>
    </div>
  );
}
