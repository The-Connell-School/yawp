import {
  data as dataResponse,
  redirect,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { AssignmentBuilderV3 } from '~/components/assignments/assignment-builder-v3';
import { loadAssignmentBuilderV3Data } from '~/components/assignments/assignment-builder-v3-loader.server';
import {
  freeTierStandardPageBodyClassName,
  freeTierStandardPageShellClassName,
} from '~/components/free-tier/free-tier-teacher-page-chrome';
import { metaLabelForFreeAssignmentTile } from '~/components/assignments/new-assignment-type-picker-grid';
import { CLASS_STARTER_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/class-starter-rubric';
import { FREE_TIER_UNLIMITED_TILE_LABEL } from '~/domain/free-tier/locked-dashboard-copy';
import { readFreeAccountUsage } from '~/domain/free-tier/inapp-usage.server';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
} from '~/domain/grading/grading-assistant-strictness';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  isAssignmentTypeAvailableForEveryScope,
} from '~/utils/assignment-type-access.server';
import { createAssignmentDeployedToClasses } from '~/utils/assignment-deployment.server';
import { FreeClassroomAssignmentQuotaError } from '~/utils/assignment-quota.server';
import {
  parseAssignmentGradingIntent,
  parseAssignmentRubricOverrides,
} from '~/utils/assignment-grading-intent.server';
import { parseAssignmentTutorEnabled } from '~/utils/assignment-tutor-enabled.server';
import { resolveAssignmentPrompt } from '~/utils/assignment-exit-ticket.server';
import { safeDomainErrorTextForClientResponse } from '~/utils/server-error-request-context.server';
import { CLASS_STARTER_DEFAULT_POINT_VALUE } from '~/domain/assignments/new-assignment-defaults';

export const FIRST_ASSIGNMENT_PAGE_TITLE = 'Create your first assignment';
export const FIRST_ASSIGNMENT_INTRO =
  "You're approved. We set up a Class Starter for you: a short, low-stakes write that gets every student into Yawp! on day one.";
export const FIRST_ASSIGNMENT_DEFAULT_TITLE = 'Something I Love';
export const FIRST_ASSIGNMENT_DEFAULT_PROMPT =
  'Tell me about a movie, TV show, book, or musical artist you love. What is it, and what makes it so great? Convince me to check it out.';
export const FIRST_ASSIGNMENT_DEFAULT_POINT_VALUE = CLASS_STARTER_DEFAULT_POINT_VALUE;

function isFirstAssignmentRequest(url: URL) {
  const flag = url.searchParams.get('first') ?? url.searchParams.get('onboarding');
  return flag === '1' || flag === 'true';
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') throw redirect('/app');

  const url = new URL(request.url);
  const isFirstAssignment = isFirstAssignmentRequest(url);
  const queryAssignmentTypeId = url.searchParams.get('assignmentTypeId') ?? '';
  const queryClassId = url.searchParams.get('classId') ?? '';
  const queryPrompt = url.searchParams.get('prompt') ?? '';
  const queryTitle = url.searchParams.get('title') ?? '';

  const v3 = await loadAssignmentBuilderV3Data(request);
  const usage = await readFreeAccountUsage(profile, true, userId);

  const classStarterType =
    v3.assignmentTypes.find(
      (type) => type.kind === CLASS_STARTER_ASSIGNMENT_TYPE_KIND
    ) ??
    v3.assignmentTypes.find((type) => type.id === queryAssignmentTypeId);

  const defaultClassId =
    queryClassId || usage?.classId || v3.classes[0]?.id || '';

  let defaultAssignmentTypeId = queryAssignmentTypeId;
  if (isFirstAssignment) {
    defaultAssignmentTypeId =
      queryAssignmentTypeId || classStarterType?.id || '';
  } else if (!defaultAssignmentTypeId) {
    defaultAssignmentTypeId =
      v3.assignmentTypes.find(
        (type) => !type.quotaExhausted && !type.unavailableReason
      )?.id ?? '';
  }

  const selectableFromUsage = (usage?.assignments ?? [])
    .map((row) => {
      const type = v3.assignmentTypes.find((t) => t.kind === row.kind);
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
        disabled:
          !usage?.unlimitedFreeAssignmentTiles && row.remaining === 0,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const selectableTypes =
    selectableFromUsage.length > 0
      ? selectableFromUsage
      : v3.assignmentTypes.map((type) => ({
          id: type.id,
          label: type.title,
          meta: FREE_TIER_UNLIMITED_TILE_LABEL,
          disabled: false,
        }));

  const priorAssignmentCount = await prisma.classAssignment.count({
    where: {
      class: {
        teachers: { some: { id: profile.id } },
        isArchived: false,
      },
    },
  });

  return {
    ...v3,
    isFirstAssignment,
    selectableTypes,
    priorAssignmentCount,
    defaults: {
      assignmentTypeId: defaultAssignmentTypeId,
      classId: defaultClassId,
      classIds: defaultClassId ? [defaultClassId] : [],
      title: isFirstAssignment ? FIRST_ASSIGNMENT_DEFAULT_TITLE : queryTitle,
      prompt: isFirstAssignment
        ? FIRST_ASSIGNMENT_DEFAULT_PROMPT
        : queryPrompt,
      pointValue: isFirstAssignment
        ? String(FIRST_ASSIGNMENT_DEFAULT_POINT_VALUE)
        : '',
      dueAt: '',
    },
  };
}

/** First-assignment onboarding still posts here (legacy form + tests). */
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') {
    return dataResponse({ error: 'Only teachers can create assignments.' }, { status: 403 });
  }

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

  if (!assignmentTypeId || !classId || !prompt) {
    return dataResponse({ error: 'Missing required fields.' }, { status: 400 });
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
    const priorAssignmentCount = await prisma.classAssignment.count({
      where: {
        class: {
          teachers: { some: { id: profile.id } },
          isArchived: false,
        },
      },
    });

    const assignment = await createAssignmentDeployedToClasses({
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

    if (priorAssignmentCount === 0) {
      const celebrationParams = new URLSearchParams({
        firstAssignment: assignment.id,
        firstAssignmentClassId: classId,
      });
      return redirect(`/app?${celebrationParams.toString()}`);
    }

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

export default function NewAssignmentPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <section className={freeTierStandardPageShellClassName('!overflow-hidden')}>
      <div
        className={freeTierStandardPageBodyClassName(
          'flex h-full min-h-0 flex-col !max-w-none !px-0 !py-0'
        )}
      >
        <AssignmentBuilderV3
          mode="create"
          assignmentTypes={data.assignmentTypes}
          siteLicenseLockedAssignmentTiles={
            data.siteLicenseLockedAssignmentTiles
          }
          classes={data.classes}
          defaults={data.defaults}
          isFirstAssignment={data.isFirstAssignment}
          firstAssignmentPageTitle={FIRST_ASSIGNMENT_PAGE_TITLE}
          firstAssignmentIntro={FIRST_ASSIGNMENT_INTRO}
          priorAssignmentCount={data.priorAssignmentCount}
        />
      </div>
    </section>
  );
}
