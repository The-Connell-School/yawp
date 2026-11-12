import { redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { AssignmentBuilderV3 } from '~/components/assignments/assignment-builder-v3';
import {
  formatClassLabel,
  loadAssignmentBuilderV3Data,
} from '~/components/assignments/assignment-builder-v3-loader.server';
import {
  freeTierStandardPageBodyClassName,
  freeTierStandardPageShellClassName,
} from '~/components/free-tier/free-tier-teacher-page-chrome';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  parseGradingAssistantStrictnessLevel,
  type GradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { toDateInputValue } from '~/utils/date-only';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') throw redirect('/app');

  const assignmentId = params.assignmentId!;
  const requestedClassId = new URL(request.url).searchParams.get('classId');

  const deployments = await prisma.classAssignment.findMany({
    where: {
      assignmentId,
      class: { teachers: { some: { id: profile.id } } },
    },
    select: {
      classId: true,
      postAt: true,
      dueAt: true,
      class: {
        select: { id: true, grade: true, period: true, title: true },
      },
      assignment: {
        select: {
          id: true,
          title: true,
          prompt: true,
          promptAttachmentName: true,
          submitForGrade: true,
          pointValue: true,
          tutorEnabled: true,
          grammarGradingEnabled: true,
          collaborationEnabled: true,
          gradingAssistantStrictnessLevel: true,
          assignmentTypeId: true,
          assignmentType: { select: { title: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (deployments.length === 0) {
    throw redirect('/app/assignments');
  }

  const active =
    deployments.find((row) => row.classId === requestedClassId) ??
    deployments[0]!;

  const v3 = await loadAssignmentBuilderV3Data(request);

  const strictness =
    parseGradingAssistantStrictnessLevel(
      active.assignment.gradingAssistantStrictnessLevel
    ) ?? DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL;

  const classLabels = deployments.map((row) => formatClassLabel(row.class));
  const breadcrumbTitle =
    active.assignment.title?.trim() ||
    active.assignment.assignmentType.title ||
    'Assignment';

  return {
    ...v3,
    editing: {
      assignmentId: active.assignment.id,
      classId: active.classId,
      breadcrumbTitle,
      assignmentTypeId: active.assignment.assignmentTypeId,
      classLabels,
      title: active.assignment.title ?? '',
      prompt: active.assignment.prompt,
      postAt: active.postAt ? active.postAt.toISOString() : null,
      dueAt: active.dueAt ? active.dueAt.toISOString() : null,
      submitForGrade: active.assignment.submitForGrade,
      pointValue: active.assignment.pointValue,
      strictness: strictness as GradingAssistantStrictnessLevel,
      tutorEnabled: active.assignment.tutorEnabled,
      grammarGradingEnabled: active.assignment.grammarGradingEnabled ?? false,
      collaborationEnabled: active.assignment.collaborationEnabled,
      promptAttachmentName: active.assignment.promptAttachmentName,
      assignmentTypeLocked: active.assignment.collaborationEnabled,
    },
    defaults: {
      assignmentTypeId: active.assignment.assignmentTypeId,
      classIds: [],
      title: active.assignment.title ?? '',
      prompt: active.assignment.prompt,
      pointValue:
        active.assignment.pointValue != null
          ? String(active.assignment.pointValue)
          : '',
      dueAt: active.dueAt
        ? toDateInputValue(active.dueAt)
        : '',
    },
  };
}

export default function EditAssignmentPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <section className={freeTierStandardPageShellClassName('!overflow-hidden')}>
      <div
        className={freeTierStandardPageBodyClassName(
          'flex h-full min-h-0 flex-col !max-w-none !px-0 !py-0'
        )}
      >
        <AssignmentBuilderV3
          mode="edit"
          assignmentTypes={data.assignmentTypes}
          siteLicenseLockedAssignmentTiles={
            data.siteLicenseLockedAssignmentTiles
          }
          classes={data.classes}
          defaults={data.defaults}
          editing={data.editing}
        />
      </div>
    </section>
  );
}
