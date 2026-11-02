import { useEffect, useMemo, useState } from 'react';
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
import { CaretLeftIcon, CaretRightIcon } from '~/components/icons';
import {
  NewAssignmentTypePickerGrid,
  metaLabelForFreeAssignmentTile,
} from '~/components/assignments/new-assignment-type-picker-grid';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { TeachingApprovalRequiredAlert } from '~/components/free-tier/teaching-approval-required-alert';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';
import { lockedTeachingButtonProps } from '~/components/free-tier/locked-teaching-control';
import { CLASS_STARTER_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/class-starter-rubric';
import { isTeachingApprovalRequiredActionData } from '~/domain/free-tier/teaching-approval-required';
import { loadSiteLicenseLockedAssignmentTiles } from '~/domain/free-tier/site-license-locked-assignment-tiles.server';
import { readFreeAccountUsage } from '~/domain/free-tier/inapp-usage.server';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
} from '~/domain/grading/grading-assistant-strictness';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  getAvailableAssignmentTypesForScopes,
  isAssignmentTypeAvailableForEveryScope,
} from '~/utils/assignment-type-access.server';
import { createAssignmentDeployedToClasses } from '~/utils/assignment-deployment.server';
import { FreeClassroomAssignmentQuotaError } from '~/utils/assignment-quota.server';
import { formatClassCardTitle } from '~/utils/class-display';
import {
  parseAssignmentGradingIntent,
  parseAssignmentRubricOverrides,
} from '~/utils/assignment-grading-intent.server';
import { parseAssignmentTutorEnabled } from '~/utils/assignment-tutor-enabled.server';
import { resolveAssignmentPrompt } from '~/utils/assignment-exit-ticket.server';
import { safeDomainErrorTextForClientResponse } from '~/utils/server-error-request-context.server';
import { FREE_TIER_UNLIMITED_TILE_LABEL } from '~/domain/free-tier/locked-dashboard-copy';
import { cn } from '~/utils/misc';

export const FIRST_ASSIGNMENT_PAGE_TITLE = 'Create your first assignment';
export const FIRST_ASSIGNMENT_INTRO =
  "You're approved. We set up a Class Starter for you: a short, low-stakes write that gets every student into Yawp! on day one.";
export const FIRST_ASSIGNMENT_DEFAULT_TITLE = 'Welcome to Yawp! Class Starter';
export const FIRST_ASSIGNMENT_DEFAULT_PROMPT =
  'Introduce yourself as a writer. What is one thing you like to write, or would like to get better at writing this year? Write five or more sentences.';
export const FIRST_ASSIGNMENT_PROMPT_CAPTION =
  'Prefilled for you. Keep it or make it your own.';

const mutedFieldClassName = 'bg-muted';

async function assertFreeTierNewAssignmentRoute() {
  const { isFreeTierEnabled } =
    await import('~/domain/feature-flags/feature-flags.server');
  if (!(await isFreeTierEnabled())) {
    throw new Response(null, { status: 404, statusText: 'Not Found' });
  }
}

function isFirstAssignmentRequest(url: URL) {
  const flag = url.searchParams.get('first') ?? url.searchParams.get('onboarding');
  return flag === '1' || flag === 'true';
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') throw redirect('/app');
  await assertFreeTierNewAssignmentRoute();

  const url = new URL(request.url);
  const isFirstAssignment = isFirstAssignmentRequest(url);
  const queryAssignmentTypeId = url.searchParams.get('assignmentTypeId') ?? '';
  const queryClassId = url.searchParams.get('classId') ?? '';

  const classes = await prisma.class.findMany({
    where: { teachers: { some: { id: profile.id } }, isArchived: false },
    select: {
      id: true,
      schoolId: true,
      grade: true,
      period: true,
      title: true,
      school: { select: { name: true, organizationId: true } },
    },
    orderBy: [{ grade: 'asc' }, { period: 'asc' }],
  });

  const assignmentTypeRows = await getAvailableAssignmentTypesForScopes<{
    id: string;
    title: string;
    kind: string | null;
    image: { id: string; altText: string | null } | null;
    rubric: { name: string } | null;
  }>({
    scopes: [
      {
        organizationId: profile.organization.id,
        schoolId: classes[0]?.schoolId,
        teacherProfileId: profile.id,
      },
    ],
    select: {
      id: true,
      title: true,
      kind: true,
      image: { select: { id: true, altText: true } },
      rubric: { select: { name: true } },
    },
    orderBy: { position: 'asc' },
  });

  const assignmentTypesForClient = assignmentTypeRows.map((type) => ({
    id: type.id,
    title: type.title,
    kind: type.kind,
    imageId: type.image?.id ?? null,
    imageTitle: type.image?.altText ?? null,
    rubricName: type.rubric?.name ?? null,
  }));

  const siteLicenseLockedAssignmentTiles =
    await loadSiteLicenseLockedAssignmentTiles(profile.organization);

  const usage = await readFreeAccountUsage(profile, true, userId);

  const classStarterType =
    assignmentTypesForClient.find(
      (type) => type.kind === CLASS_STARTER_ASSIGNMENT_TYPE_KIND
    ) ??
    assignmentTypesForClient.find((type) => type.id === queryAssignmentTypeId);

  const defaultClassId =
    queryClassId || usage?.classId || classes[0]?.id || '';

  let defaultAssignmentTypeId = queryAssignmentTypeId;
  if (isFirstAssignment) {
    defaultAssignmentTypeId =
      queryAssignmentTypeId || classStarterType?.id || '';
  }

  const selectableFromUsage = (usage?.assignments ?? [])
    .map((row) => {
      const type = assignmentTypesForClient.find((t) => t.kind === row.kind);
      if (!type) return null;
      return {
        id: type.id,
        label: row.label,
        meta: metaLabelForFreeAssignmentTile({
          unlimitedFreeAssignmentTiles: Boolean(
            usage?.unlimitedFreeAssignmentTiles
          ),
          remaining: row.remaining,
          total: row.total,
        }),
        imageId: type.imageId,
        imageTitle: type.imageTitle,
        disabled:
          !usage?.unlimitedFreeAssignmentTiles && row.remaining === 0,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const selectableTypes =
    selectableFromUsage.length > 0
      ? selectableFromUsage
      : assignmentTypesForClient.map((type) => ({
          id: type.id,
          label: type.title,
          meta: FREE_TIER_UNLIMITED_TILE_LABEL,
          imageId: type.imageId,
          imageTitle: type.imageTitle,
          disabled: false,
        }));

  return {
    isFirstAssignment,
    assignmentTypes: assignmentTypesForClient,
    selectableTypes,
    siteLicenseLockedAssignmentTiles,
    classes: classes.map((klass) => ({
      id: klass.id,
      label: formatClassCardTitle(klass),
    })),
    defaults: {
      assignmentTypeId: defaultAssignmentTypeId,
      classId: defaultClassId,
      title: isFirstAssignment ? FIRST_ASSIGNMENT_DEFAULT_TITLE : '',
      prompt: isFirstAssignment ? FIRST_ASSIGNMENT_DEFAULT_PROMPT : '',
    },
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') {
    return dataResponse({ error: 'Only teachers can create assignments.' }, { status: 403 });
  }

  await assertFreeTierNewAssignmentRoute();

  const formData = await request.formData();
  const { guardTeachingFormAction } =
    await import('~/domain/free-tier/teaching-approval-required.server');
  const blocked = await guardTeachingFormAction(request, userId, formData);
  if (blocked) return blocked;

  const intent = formData.get('intent')?.toString();
  if (intent !== 'create-assignment') {
    return dataResponse({ error: 'Unsupported action.' }, { status: 400 });
  }

  const assignmentTypeId = formData.get('assignmentTypeId')?.toString() ?? '';
  const classId = formData.get('classId')?.toString() ?? '';
  const titleRaw = formData.get('title')?.toString() ?? '';
  const promptRaw = formData.get('prompt')?.toString() ?? '';
  const dueAtRaw = formData.get('dueAt')?.toString()?.trim() ?? '';

  const title = titleRaw.trim() || null;
  const prompt = promptRaw.trim();

  if (!assignmentTypeId) {
    return dataResponse({ error: 'Assignment type is required.' }, { status: 400 });
  }
  if (!classId) {
    return dataResponse({ error: 'Class is required.' }, { status: 400 });
  }
  if (!prompt) {
    return dataResponse({ error: 'Prompt is required.' }, { status: 400 });
  }

  const klass = await prisma.class.findFirst({
    where: {
      id: classId,
      teachers: { some: { id: profile.id } },
      isArchived: false,
    },
    select: {
      id: true,
      school: { select: { id: true, organizationId: true } },
    },
  });

  if (!klass) {
    return dataResponse({ error: 'Selected class is unavailable.' }, { status: 404 });
  }

  const assignmentTypeAvailable = await isAssignmentTypeAvailableForEveryScope({
    assignmentTypeId,
    scopes: [
      {
        organizationId: klass.school.organizationId,
        schoolId: klass.school.id,
        teacherProfileId: profile.id,
      },
    ],
  });

  const assignmentType = await prisma.assignmentType.findFirst({
    where: { id: assignmentTypeId, archivedAt: null },
    select: { id: true, kind: true, rubric: { select: { name: true } } },
  });

  if (!assignmentTypeAvailable || !assignmentType) {
    return dataResponse(
      { error: 'Selected assignment type is not available.' },
      { status: 400 }
    );
  }

  const resolvedPrompt = resolveAssignmentPrompt({
    assignmentTypeKind: assignmentType.kind,
    postedPrompt: prompt,
    formData,
  });
  if (!resolvedPrompt.success) {
    return dataResponse({ error: resolvedPrompt.message }, { status: 400 });
  }

  const gradingIntent = parseAssignmentGradingIntent(formData, {
    kind: assignmentType.kind,
    rubricName: assignmentType.rubric?.name ?? null,
  });
  if (!gradingIntent.success) {
    return dataResponse({ error: gradingIntent.message }, { status: 400 });
  }

  const rubricOverrides = parseAssignmentRubricOverrides(formData);
  if (!rubricOverrides.success) {
    return dataResponse({ error: rubricOverrides.message }, { status: 400 });
  }

  const tutorEnabledResult = parseAssignmentTutorEnabled(formData);
  if (!tutorEnabledResult.success) {
    return dataResponse({ error: tutorEnabledResult.message }, { status: 400 });
  }

  let dueAt: Date | null = null;
  if (dueAtRaw) {
    const parsed = new Date(dueAtRaw);
    if (Number.isNaN(parsed.getTime())) {
      return dataResponse({ error: 'The due date is invalid.' }, { status: 400 });
    }
    dueAt = parsed;
  }

  try {
    const { assignment } = await createAssignmentDeployedToClasses({
      data: {
        assignmentTypeId,
        title,
        prompt: resolvedPrompt.prompt,
        ...(resolvedPrompt.exitTicketConfigJson
          ? { exitTicketConfigJson: resolvedPrompt.exitTicketConfigJson }
          : {}),
        submitForGrade: gradingIntent.data.submitForGrade,
        pointValue: gradingIntent.data.pointValue,
        gradingAssistantStrictnessLevel: DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
        tutorEnabled: tutorEnabledResult.value,
        ...(formData.has('rubricTotalPoints')
          ? { rubricTotalPoints: rubricOverrides.data.rubricTotalPoints }
          : {}),
        ...(formData.has('gradingMode')
          ? { gradingMode: rubricOverrides.data.gradingMode }
          : {}),
      },
      classIds: [classId],
      deployment: { postAt: null, dueAt },
    });

    return redirect(`/app/assignments/${assignment.id}`);
  } catch (error) {
    if (error instanceof FreeClassroomAssignmentQuotaError) {
      return dataResponse(
        {
          error: safeDomainErrorTextForClientResponse(
            error,
            'This assignment type is not available on your plan.'
          ),
        },
        { status: 403 }
      );
    }
    throw error;
  }
}

type FormValues = {
  assignmentTypeId: string;
  title: string;
  classId: string;
  prompt: string;
  dueAt: string;
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
    dueAt: one('dueAt', defaults.dueAt),
  };
}

export default function NewAssignmentPage() {
  const {
    isFirstAssignment,
    selectableTypes,
    siteLicenseLockedAssignmentTiles,
    classes,
    defaults,
    assignmentTypes,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { locked: teachingLocked, loading: teachingLoading } =
    useTeachingAccess();

  const approvalBlocked = isTeachingApprovalRequiredActionData(actionData);
  const values = readFormValues(
    approvalBlocked ? actionData.fields : undefined,
    {
      assignmentTypeId:
        defaults.assignmentTypeId ||
        selectableTypes.find((type) => !type.disabled)?.id ||
        '',
      title: defaults.title,
      classId: defaults.classId || classes[0]?.id || '',
      prompt: defaults.prompt,
      dueAt: '',
    }
  );

  const initialTypeId = values.assignmentTypeId;
  const [selectedTypeId, setSelectedTypeId] = useState(initialTypeId);

  useEffect(() => {
    setSelectedTypeId(initialTypeId);
  }, [initialTypeId]);

  const selectedType = useMemo(
    () => assignmentTypes.find((type) => type.id === selectedTypeId),
    [assignmentTypes, selectedTypeId]
  );

  const submitLocked =
    teachingLocked || teachingLoading || approvalBlocked;

  const genericError =
    actionData && 'error' in actionData && !approvalBlocked
      ? actionData.error
      : null;

  useEffect(() => {
    if (approvalBlocked) {
      document
        .querySelector<HTMLElement>('[data-testid="teaching-approval-required-alert"]')
        ?.focus();
    }
  }, [approvalBlocked]);

  const howItWorksTo = selectedTypeId
    ? `/app/assignment-types/${selectedTypeId}/how-it-works`
    : null;

  return (
    <div className="mx-auto h-full min-h-0 w-full max-w-4xl overflow-y-auto px-4 py-8">
      {!isFirstAssignment ? (
        <Button asChild variant="ghost" size="sm" className="mb-4 px-0">
          <Link to="/app/assignments" className="w-fit">
            <CaretLeftIcon className="mr-1 h-4 w-4" /> My Assignments
          </Link>
        </Button>
      ) : (
        <Button asChild variant="ghost" size="sm" className="mb-4 px-0">
          <Link to="/app/assignments" className="w-fit">
            <CaretLeftIcon className="mr-1 h-4 w-4" /> My Assignments
          </Link>
        </Button>
      )}
      <h1 className="text-2xl font-semibold">
        {isFirstAssignment ? FIRST_ASSIGNMENT_PAGE_TITLE : 'New assignment'}
      </h1>
      {isFirstAssignment ? (
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {FIRST_ASSIGNMENT_INTRO}
        </p>
      ) : null}

      <Form
        method="post"
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          if (teachingLoading) event.preventDefault();
        }}
      >
        <input type="hidden" name="intent" value="create-assignment" />
        <input type="hidden" name="submitForGrade" value="true" />
        <input
          type="hidden"
          name="gradingAssistantStrictnessLevel"
          value={DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL}
        />
        <input type="hidden" name="tutorEnabled" value="true" />

        {approvalBlocked ? <TeachingApprovalRequiredAlert /> : null}
        {genericError ? (
          <p className="text-sm text-destructive" role="alert">
            {genericError}
          </p>
        ) : null}

        <NewAssignmentTypePickerGrid
          selectableTypes={selectableTypes}
          lockedTiles={siteLicenseLockedAssignmentTiles}
          selectedTypeId={selectedTypeId}
          onSelectTypeId={setSelectedTypeId}
        />

        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={values.title}
            placeholder={
              isFirstAssignment ? undefined : 'e.g. Community Gardens — Prewriting'
            }
            className={mutedFieldClassName}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="classId">Class</Label>
          <select
            id="classId"
            name="classId"
            required
            defaultValue={values.classId}
            className={cn(
              'h-9 w-full rounded-md border border-input px-3 text-sm',
              mutedFieldClassName
            )}
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
            placeholder={
              isFirstAssignment ? undefined : 'What should students write about?'
            }
            className={mutedFieldClassName}
          />
          <p className="text-xs text-muted-foreground">
            {isFirstAssignment
              ? FIRST_ASSIGNMENT_PROMPT_CAPTION
              : 'Students see this exactly as written.'}
          </p>
        </div>

        {!isFirstAssignment ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="dueAt">Due date</Label>
              <Input
                id="dueAt"
                name="dueAt"
                type="date"
                defaultValue={values.dueAt}
                placeholder="Optional"
                className={mutedFieldClassName}
              />
            </div>
            <div className="space-y-1">
              <Label>Rubric</Label>
              <p className="text-sm text-muted-foreground">
                {selectedType?.rubricName
                  ? `${selectedType.rubricName} (default)`
                  : 'Default rubric for this type'}
              </p>
            </div>
          </>
        ) : null}

        {isFirstAssignment ? (
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center gap-3">
              {howItWorksTo ? (
                <Button type="button" variant="outline" asChild>
                  <Link to={howItWorksTo}>
                    Try it as your students will
                    <CaretRightIcon className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button type="button" variant="outline" disabled>
                  Try it as your students will
                  <CaretRightIcon className="ml-1 h-4 w-4" />
                </Button>
              )}
              <Button
                type="submit"
                disabled={navigation.state !== 'idle' && !approvalBlocked}
                {...lockedTeachingButtonProps(submitLocked)}
              >
                Create
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              You can change anything later.{' '}
              <Link
                to="/app"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Skip for now
              </Link>
            </p>
          </div>
        ) : (
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
        )}
      </Form>
    </div>
  );
}
