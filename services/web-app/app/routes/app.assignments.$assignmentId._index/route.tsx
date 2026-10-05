import { effectiveParagraphModes } from '~/domain/assignment-types/daily-pages-paragraph-modes';
import { getCreationTypeDefaultsById } from '~/domain/grading/writing-time.server';
import { parseWritingTimeMinutes } from '~/domain/grading/writing-time';
import { useState, type MouseEvent, type ReactNode } from 'react';
import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
  Link,
  redirect,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from 'react-router';
import { toCollaborationGroupMode } from '~/domain/assignments/collaboration';
import { Copy, Pencil, UsersIcon } from 'lucide-react';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { CaretLeftIcon } from '~/components/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import { TutorOffBadge } from '~/components/assignments/tutor-off-badge';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  parseGradingAssistantStrictnessLevel,
  type GradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import { formatClassLabel } from '~/utils/class-display';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import {
  AssignmentSummarySheetContent,
  type AssignmentSummarySheetAssignment,
} from '../app.my-classes.$classId/assignment-summary-sheet';
import { mergeClassDocumentsViewPreferences } from '../app.my-classes.$classId/class-documents-view-preferences';
import type { ClassInsightSummary } from '~/domain/assignment-insights/class-insight-synthesis';
import {
  AssignmentPromptAttachmentError,
  assignmentPromptAttachmentRequestTooLarge,
  deleteAssignmentPromptAttachment,
  uploadAssignmentPromptAttachment,
} from '~/domain/assignments/assignment-prompt-attachment.server';
import {
  DEFAULT_ASSIGNMENT_POINT_VALUE,
  parseAssignmentGradingIntent,
  parseAssignmentRubricOverrides,
} from '~/utils/assignment-grading-intent.server';
import { parseAssignmentTutorEnabled } from '~/utils/assignment-tutor-enabled.server';
import { createAssignmentDeployedToClasses } from '~/utils/assignment-deployment.server';
import { isAssignmentTypeAvailableForEveryScope } from '~/utils/assignment-type-access.server';
import {
  getGrammarGradingAssignmentTypeIds,
  resolveAssignmentTypeGradingConfig,
} from '~/domain/assignment-types/assignment-type-grading-config.server';

/**
 * Page chrome the class route used to provide while this page was nested
 * inside it: the scroll container and the centered, padded column. Kept
 * identical to `app.my-classes.$classId` so drilling in doesn't shift the
 * content's width or gutters.
 */
function PageShell({ children }: { children: ReactNode }) {
  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="mx-auto w-full max-w-screen-xl px-3 py-3 pb-24 sm:px-5">
        {children}
      </div>
    </section>
  );
}

/**
 * Standalone assignment detail page. Deliberately not nested under the class
 * route: an assignment is opened from several places (the class page, the
 * cross-class My Assignments list), so it owns its data instead of reading a
 * parent class loader.
 *
 * One Assignment can be deployed to several classes, and the summary below is
 * class-scoped (documents, graded counts, class insight). The class comes from
 * `?classId=` when the caller knows it; otherwise this falls back to the
 * teacher's first deployment and offers a picker for the rest.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') {
    return redirect('/app');
  }

  const assignmentId = params.assignmentId!;
  const requestedClassId = new URL(request.url).searchParams.get('classId');

  // Scoped to classes this teacher actually teaches, so the URL alone never
  // exposes another teacher's class.
  const deployments = await prisma.classAssignment.findMany({
    where: {
      assignmentId,
      class: { teachers: { some: { id: profile.id } } },
    },
    select: {
      id: true,
      postAt: true,
      dueAt: true,
      classId: true,
      class: {
        select: {
          id: true,
          grade: true,
          period: true,
          title: true,
          school: {
            select: {
              id: true,
              organizationId: true,
              organization: { select: { classInsightsEnabled: true } },
            },
          },
        },
      },
      assignment: {
        select: {
          id: true,
          title: true,
          prompt: true,
          promptAttachmentName: true,
          submitForGrade: true,
          pointValue: true,
          rubricTotalPoints: true,
          gradingMode: true,
          tutorEnabled: true,
          writingTimeMinutes: true,
          paragraphMode: true,
          paragraphModes: true,
          collaborationEnabled: true,
          collaborationGroupMode: true,
          collaborationGroupSize: true,
          gradingAssistantStrictnessLevel: true,
          assignmentTypeId: true,
          assignmentType: {
            select: { id: true, title: true, systemKey: true, kind: true },
          },
        },
      },
      _count: { select: { documents: true } },
      documentGroups: { select: { openedAt: true } },
    },
    orderBy: [{ createdAt: 'asc' }],
  });

  if (deployments.length === 0) {
    return { found: false as const };
  }

  const active =
    deployments.find((deployment) => deployment.classId === requestedClassId) ??
    deployments[0];

  const classInsightsEnabled =
    active.class.school.organization.classInsightsEnabled === true;

  const [insightRow, gradedCount, assignmentTypes] = await Promise.all([
    classInsightsEnabled
      ? prisma.classAssignmentInsight.findUnique({
          where: { classAssignmentId: active.id },
          select: {
            status: true,
            submissionCount: true,
            generatedAt: true,
            summaryJson: true,
          },
        })
      : Promise.resolve(null),
    prisma.submission.count({
      where: {
        gradedAt: { not: null },
        unsubmittedAt: null,
        document: { is: { classAssignmentId: active.id, deletedAt: null } },
      },
    }),
    getAvailableAssignmentTypesForScopes<{
      id: string;
      title: string;
      systemKey: string | null;
      collaborationSupported: boolean;
    }>({
      scopes: [
        {
          organizationId: active.class.school.organizationId,
          schoolId: active.class.school.id,
          teacherProfileId: profile.id,
        },
      ],
      select: {
        id: true,
        title: true,
        systemKey: true,
        collaborationSupported: true,
      },
      orderBy: { position: 'asc' },
    }),
  ]);

  // One query for the list, so the creation sheet knows which types can offer
  // the teacher's grammar-grading toggle.
  const gradesGrammarIds = await getGrammarGradingAssignmentTypeIds(
    assignmentTypes.map((assignmentType) => assignmentType.id)
  );
  const creationTypeDefaults = await getCreationTypeDefaultsById(
    assignmentTypes.map((assignmentType) => assignmentType.id)
  );
  const assignmentTypeOptions = assignmentTypes.map((assignmentType) => ({
    ...assignmentType,
    gradesGrammar: gradesGrammarIds.has(assignmentType.id),
    defaultWritingTimeMinutes:
      creationTypeDefaults.get(assignmentType.id)?.defaultWritingTimeMinutes ??
      null,
    offersParagraphModes:
      creationTypeDefaults.get(assignmentType.id)?.offersParagraphModes ??
      false,
  }));

  const insight =
    insightRow && insightRow.status === 'ready' && insightRow.summaryJson
      ? {
          status: 'ready' as const,
          submissionCount: insightRow.submissionCount,
          generatedAt: insightRow.generatedAt
            ? insightRow.generatedAt.toISOString()
            : null,
          summary: insightRow.summaryJson as unknown as ClassInsightSummary,
        }
      : null;

  return {
    found: true as const,
    classInsightsEnabled,
    assignmentTypes: assignmentTypeOptions,
    activeClassId: active.classId,
    // Group setup is per class, because the roster is: one assignment pushed to
    // three sections needs three seating charts. `groupsOpened` decides whether
    // the button offers to set them up or to review what is already running.
    collaboration: active.assignment.collaborationEnabled
      ? {
          groupCount: active.documentGroups.length,
          groupsOpened: active.documentGroups.some(
            (group) => group.openedAt !== null
          ),
        }
      : null,
    classes: deployments.map((deployment) => ({
      id: deployment.classId,
      name: formatClassLabel(deployment.class),
    })),
    assignment: {
      id: active.assignment.id,
      classAssignmentId: active.id,
      postAt: active.postAt,
      dueAt: active.dueAt,
      title: active.assignment.title,
      prompt: active.assignment.prompt,
      promptAttachmentName: active.assignment.promptAttachmentName,
      submitForGrade: active.assignment.submitForGrade,
      pointValue: active.assignment.pointValue,
      rubricTotalPoints: active.assignment.rubricTotalPoints,
      gradingMode: active.assignment.gradingMode,
      tutorEnabled: active.assignment.tutorEnabled,
      writingTimeMinutes: active.assignment.writingTimeMinutes,
      paragraphMode: active.assignment.paragraphMode,
      paragraphModes: active.assignment.paragraphModes,
      collaborationGroupMode: active.assignment.collaborationGroupMode,
      collaborationGroupSize: active.assignment.collaborationGroupSize,
      gradingAssistantStrictnessLevel: active.assignment
        .gradingAssistantStrictnessLevel as GradingAssistantStrictnessLevel,
      assignmentTypeId: active.assignment.assignmentTypeId,
      assignmentTypeLocked: active.assignment.collaborationEnabled,
      assignmentType: active.assignment.assignmentType,
      documentCount: active._count.documents,
      gradedCount,
      insight,
    },
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') {
    return dataResponse(
      { success: false, message: 'Only teachers can manage assignments.' },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const classId = url.searchParams.get('classId');
  if (!classId) {
    return dataResponse(
      { success: false, message: 'Class is required.' },
      { status: 400 }
    );
  }

  // Verify the teacher has access to this class
  const classAccess = await prisma.class.findFirst({
    where: { id: classId, teachers: { some: { id: profile.id } } },
    select: {
      id: true,
      school: { select: { id: true, organizationId: true } },
    },
  });
  if (!classAccess) {
    return dataResponse(
      { success: false, message: 'Class not found.' },
      { status: 404 }
    );
  }

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();

  if (assignmentPromptAttachmentRequestTooLarge(request)) {
    return dataResponse(
      { success: false, message: 'PDF is too large. Maximum size is 10 MB.' },
      { status: 413 }
    );
  }

  if (intent === 'create-assignment' || intent === 'update-assignment') {
    const assignmentIdParam = params.assignmentId;
    const assignmentId =
      formData.get('assignmentId')?.toString() ?? assignmentIdParam ?? '';
    const assignmentTypeId = formData.get('assignmentTypeId')?.toString();
    const titleRaw = formData.get('title')?.toString() ?? '';
    const promptRaw = formData.get('prompt')?.toString() ?? '';
    const strictnessRaw = formData.get('gradingAssistantStrictnessLevel');
    const postAtRaw = formData.get('postAt')?.toString()?.trim() ?? '';
    const dueAtRaw = formData.get('dueAt')?.toString()?.trim() ?? '';

    const title = titleRaw.trim() || null;
    const prompt = promptRaw.trim();
    const gradingAssistantStrictnessLevel =
      intent === 'create-assignment'
        ? strictnessRaw
          ? parseGradingAssistantStrictnessLevel(strictnessRaw)
          : DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL
        : null;

    if (!assignmentTypeId) {
      return dataResponse(
        { success: false, message: 'Assignment type is required.' },
        { status: 400 }
      );
    }

    // Scope assignment type availability to this teacher+class
    const allowedAssignmentTypes = await getAvailableAssignmentTypesForScopes<{
      id: string;
      systemKey: string | null;
    }>({
      scopes: [
        {
          organizationId: classAccess.school.organizationId,
          schoolId: classAccess.school.id,
          teacherProfileId: profile.id,
        },
      ],
      select: { id: true, systemKey: true },
    });
    const selectedAssignmentType = allowedAssignmentTypes.find(
      (type) => type.id === assignmentTypeId
    );
    if (selectedAssignmentType?.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY) {
      return dataResponse(
        {
          success: false,
          message: 'Choose an APUSH prompt from the library first.',
        },
        { status: 400 }
      );
    }

    if (!prompt) {
      return dataResponse(
        { success: false, message: 'Prompt is required.' },
        { status: 400 }
      );
    }
    if (intent === 'create-assignment' && !gradingAssistantStrictnessLevel) {
      return dataResponse(
        {
          success: false,
          message: 'Grading assistant strictness level is invalid.',
        },
        { status: 400 }
      );
    }

    const gradingIntent = parseAssignmentGradingIntent(formData);
    if (!gradingIntent.success) {
      return dataResponse(
        { success: false, message: gradingIntent.message },
        { status: 400 }
      );
    }
    const rubricOverrides = parseAssignmentRubricOverrides(formData);
    if (!rubricOverrides.success) {
      return dataResponse(
        { success: false, message: rubricOverrides.message },
        { status: 400 }
      );
    }
    const writingTimeResult = parseWritingTimeMinutes(formData);
    if (!writingTimeResult.success) {
      return dataResponse(
        { success: false, message: writingTimeResult.message },
        { status: 400 }
      );
    }
    // Only written when the form sent it, so an older caller that omits the
    // field leaves the stored value alone. Blank clears it.
    const writingTimeData = writingTimeResult.sent
      ? { writingTimeMinutes: writingTimeResult.value }
      : {};

    const promptAttachment = formData.get('promptAttachment');
    let promptAttachmentData:
      | {
          promptAttachmentKey: string | null;
          promptAttachmentName: string | null;
          promptAttachmentSize: number | null;
        }
      | undefined =
      formData.get('removePromptAttachment') === 'true'
        ? {
            promptAttachmentKey: null,
            promptAttachmentName: null,
            promptAttachmentSize: null,
          }
        : undefined;
    if (promptAttachment instanceof File && promptAttachment.size > 0) {
      try {
        promptAttachmentData =
          await uploadAssignmentPromptAttachment(promptAttachment);
      } catch (error) {
        if (error instanceof AssignmentPromptAttachmentError) {
          return dataResponse(
            { success: false, message: error.message },
            { status: 400 }
          );
        }
        throw error;
      }
    }

    const tutorEnabledResult = parseAssignmentTutorEnabled(formData);
    if (!tutorEnabledResult.success) {
      return dataResponse(
        { success: false, message: tutorEnabledResult.message },
        { status: 400 }
      );
    }

    // Parse optional deployment dates (per-class)
    let postAt: Date | null | undefined = undefined;
    let dueAt: Date | null | undefined = undefined;
    if (postAtRaw) {
      const parsed = new Date(postAtRaw);
      if (Number.isNaN(parsed.getTime())) {
        return dataResponse(
          { success: false, message: 'The post date is invalid.' },
          { status: 400 }
        );
      }
      postAt = parsed;
    } else if (formData.has('postAt')) {
      postAt = null;
    }
    if (dueAtRaw) {
      const parsed = new Date(dueAtRaw);
      if (Number.isNaN(parsed.getTime())) {
        return dataResponse(
          { success: false, message: 'The due date is invalid.' },
          { status: 400 }
        );
      }
      dueAt = parsed;
    } else if (formData.has('dueAt')) {
      dueAt = null;
    }

    if (intent === 'create-assignment') {
      try {
        await createAssignmentDeployedToClasses({
          data: {
            assignmentTypeId,
            title,
            prompt,
            submitForGrade: gradingIntent.data.submitForGrade,
            pointValue: gradingIntent.data.pointValue,
            rubricTotalPoints: rubricOverrides.data.rubricTotalPoints,
            gradingMode: rubricOverrides.data.gradingMode,
            gradingAssistantStrictnessLevel: gradingAssistantStrictnessLevel!,
            tutorEnabled: tutorEnabledResult.value,
            ...promptAttachmentData,
          },
          classIds: [classId],
          deployment: {
            postAt: postAt ?? null,
            dueAt: dueAt ?? null,
          },
        });
      } catch (error) {
        if (promptAttachmentData?.promptAttachmentKey) {
          await deleteAssignmentPromptAttachment(
            promptAttachmentData.promptAttachmentKey
          ).catch(() => {});
        }
        throw error;
      }

      return dataResponse({
        success: true,
        message: 'Assignment created successfully.',
      });
    }

    // Update path
    // Load current to validate and to cleanup attachments if needed
    const existingAssignment = await prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        classAssignments: { some: { classId } },
      },
      select: {
        id: true,
        assignmentTypeId: true,
        collaborationEnabled: true,
        promptAttachmentKey: true,
        assignmentType: { select: { systemKey: true } },
      },
    });
    if (!existingAssignment) {
      return dataResponse(
        { success: false, message: 'Assignment not found.' },
        { status: 404 }
      );
    }

    if (
      assignmentTypeId !== existingAssignment.assignmentTypeId &&
      existingAssignment.collaborationEnabled
    ) {
      return dataResponse(
        {
          success: false,
          message:
            'Assignment type cannot change on a collaborative assignment.',
        },
        { status: 409 }
      );
    }

    if (assignmentTypeId !== existingAssignment.assignmentTypeId) {
      const sharedArtifact = await prisma.documentGroup.findFirst({
        where: {
          documentId: { not: null },
          classAssignment: { assignmentId: existingAssignment.id },
        },
        select: { id: true },
      });
      if (sharedArtifact) {
        return dataResponse(
          {
            success: false,
            message:
              'Assignment type cannot change after shared group drafts are created.',
          },
          { status: 409 }
        );
      }
    }

    try {
      await prisma.assignment.update({
        where: { id: existingAssignment.id },
        data: {
          assignmentTypeId,
          title,
          prompt,
          submitForGrade: gradingIntent.data.submitForGrade,
          pointValue: gradingIntent.data.pointValue,
          ...(formData.has('rubricTotalPoints')
            ? { rubricTotalPoints: rubricOverrides.data.rubricTotalPoints }
            : {}),
          ...(formData.has('gradingMode')
            ? { gradingMode: rubricOverrides.data.gradingMode }
            : {}),
          ...(gradingAssistantStrictnessLevel
            ? { gradingAssistantStrictnessLevel }
            : {}),
          ...(formData.has('tutorEnabled')
            ? { tutorEnabled: tutorEnabledResult.value }
            : {}),
          ...writingTimeData,
          ...promptAttachmentData,
        },
      });
      if (postAt !== undefined || dueAt !== undefined) {
        await prisma.classAssignment.updateMany({
          where: { assignmentId: existingAssignment.id, classId },
          data: {
            ...(postAt !== undefined ? { postAt } : {}),
            ...(dueAt !== undefined ? { dueAt } : {}),
          },
        });
      }
    } catch (error) {
      if (
        promptAttachmentData?.promptAttachmentKey &&
        promptAttachmentData.promptAttachmentKey !==
          existingAssignment.promptAttachmentKey
      ) {
        await deleteAssignmentPromptAttachment(
          promptAttachmentData.promptAttachmentKey
        ).catch(() => {});
      }
      throw error;
    }
    if (
      promptAttachmentData &&
      existingAssignment.promptAttachmentKey &&
      existingAssignment.promptAttachmentKey !==
        promptAttachmentData.promptAttachmentKey
    ) {
      await deleteAssignmentPromptAttachment(
        existingAssignment.promptAttachmentKey
      ).catch(() => {});
    }

    return dataResponse({
      success: true,
      message: 'Assignment updated successfully.',
    });
  }

  return dataResponse(
    { success: false, message: 'Unsupported action.' },
    { status: 400 }
  );
}

export default function AssignmentDetailRoute() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isDuplicateSheetOpen, setIsDuplicateSheetOpen] = useState(false);

  const handleEditSheetOpenChange = (open: boolean) => {
    setIsEditSheetOpen(open);
  };

  if (!data.found) {
    return (
      <PageShell>
        <div className="text-foreground" data-testid="assignment-detail-page">
          <div className="mb-4">
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/assignments" className="w-fit">
                <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to assignments
              </Link>
            </Button>
          </div>

          <div className="rounded-xl bg-card p-6 text-center ring-1 ring-border">
            <p className="text-sm text-muted-foreground">
              Assignment not found.
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  const { assignment, activeClassId, classes, collaboration } = data;
  const backHref = `/app/my-classes/${activeClassId}?tab=assignments`;

  /**
   * Back goes back — to whatever opened this page (a class's Assignments tab,
   * the cross-class My Assignments list), not to a hardcoded destination.
   * In-page navigation here replaces history rather than pushing, so one press
   * always leaves the page instead of unwinding class switches first. The
   * href fallback covers a cold deep link, which has nothing to go back to.
   */
  const canGoBack =
    typeof window !== 'undefined' &&
    typeof window.history.state?.idx === 'number' &&
    window.history.state.idx > 0;

  const handleBack = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!canGoBack) return;
    event.preventDefault();
    navigate(-1);
  };
  const canEdit =
    assignment.assignmentType.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY;

  const assignmentForContent: AssignmentSummarySheetAssignment = {
    id: assignment.id,
    classAssignmentId: assignment.classAssignmentId,
    title: assignment.title,
    prompt: assignment.prompt,
    promptAttachmentName: assignment.promptAttachmentName,
    submitForGrade: assignment.submitForGrade,
    pointValue: assignment.pointValue,
    assignmentType: assignment.assignmentType,
    documentCount: assignment.documentCount,
    gradedCount: assignment.gradedCount,
    insight: assignment.insight,
    paragraphMode: assignment.paragraphMode,
    paragraphModes: assignment.paragraphModes,
    writingTimeMinutes: assignment.writingTimeMinutes,
  };

  const handleViewDocuments = () => {
    const next = new URLSearchParams();
    next.set('tab', 'documents');
    next.set('assignmentId', assignment.id);
    mergeClassDocumentsViewPreferences(next);
    navigate(`/app/my-classes/${activeClassId}?${next.toString()}`);
  };

  const handleClassChange = (classId: string) => {
    setIsEditSheetOpen(false);
    const next = new URLSearchParams(searchParams);
    next.set('classId', classId);
    setSearchParams(next, { replace: true });
  };

  const documentCount = assignment.documentCount;
  const activeClassOption = classes.find(
    (klass) => klass.id === activeClassId
  ) ?? { id: activeClassId, name: 'This class' };

  return (
    <PageShell>
      <div className="text-foreground" data-testid="assignment-detail-page">
        <div className="mb-4">
          <Button asChild variant="ghost" size="sm">
            <Link to={backHref} onClick={handleBack} className="w-fit">
              <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to assignments
            </Link>
          </Button>
        </div>

        <>
          <div className="mb-6 overflow-hidden rounded-xl border bg-white dark:bg-card">
            <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <h1 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">
                  {assignment.title?.trim() || 'Untitled Assignment'}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-base/6 text-muted-foreground sm:text-sm/5">
                  {assignment.assignmentType ? (
                    <Badge variant="outline" size="sm">
                      {assignment.assignmentType.title}
                    </Badge>
                  ) : null}
                  <TutorOffBadge tutorEnabled={assignment.tutorEnabled} />
                  <span>
                    {assignment.submitForGrade
                      ? `${assignment.pointValue ?? 100} points`
                      : 'View only'}
                  </span>
                  <span>
                    {documentCount}{' '}
                    {documentCount === 1 ? 'document' : 'documents'}
                  </span>
                </div>
              </div>
              <div
                className="flex shrink-0 items-center gap-2"
                data-testid="assignment-detail-actions"
              >
                {classes.length > 1 ? (
                  <Select
                    value={activeClassId}
                    onValueChange={handleClassChange}
                  >
                    <SelectTrigger
                      className="w-[200px]"
                      aria-label="Class"
                      data-testid="assignment-detail-class-picker"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((klass) => (
                        <SelectItem key={klass.id} value={klass.id}>
                          {klass.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                {collaboration ? (
                  <Button asChild variant="outline">
                    <Link
                      to={`/app/class-assignments/${assignment.classAssignmentId}/groups`}
                      data-testid="assignment-detail-groups-link"
                    >
                      <UsersIcon className="mr-2 h-4 w-4" />
                      {collaboration.groupsOpened
                        ? 'Groups'
                        : collaboration.groupCount > 0
                          ? 'Finish setting up groups'
                          : 'Set up groups'}
                    </Link>
                  </Button>
                ) : null}
                {canEdit ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setIsDuplicateSheetOpen(true)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditSheetOpen(true)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <AssignmentSummarySheetContent
            assignment={assignmentForContent}
            classInsightsEnabled={data.classInsightsEnabled}
            onViewDocuments={handleViewDocuments}
            renderSheet={false}
            hideHeader
          />
        </>

        {/* Editing uses the same sheet as creating — one form, one layout,
            with the settings that cannot change after creation frozen. */}
        <AssignmentCreationSheet
          open={isEditSheetOpen}
          onOpenChange={handleEditSheetOpenChange}
          entryPoint="class"
          fixedClassId={activeClassId}
          assignmentTypes={data.assignmentTypes}
          teacherClasses={[activeClassOption]}
          editingAssignment={{
            id: assignment.id,
            promptAttachmentName: assignment.promptAttachmentName,
            assignmentTypeLocked: assignment.assignmentTypeLocked,
          }}
          initialAssignmentTypeId={assignment.assignmentTypeId}
          initialTitle={assignment.title ?? ''}
          initialPrompt={assignment.prompt}
          initialPostAt={assignment.postAt ?? null}
          initialDueAt={assignment.dueAt ?? null}
          initialSubmitForGrade={assignment.submitForGrade}
          initialPointValue={assignment.pointValue}
          initialRubricTotalPoints={assignment.rubricTotalPoints}
          initialGradingMode={assignment.gradingMode === 'bands' ? 'bands' : 'step'}
          initialTutorEnabled={assignment.tutorEnabled}
          initialWritingTimeMinutes={assignment.writingTimeMinutes ?? null}
          initialParagraphModes={effectiveParagraphModes(assignment)}
          initialCollaborationEnabled={Boolean(data.collaboration)}
          initialCollaborationGroupMode={toCollaborationGroupMode(
            assignment.collaborationGroupMode
          )}
          initialCollaborationGroupSize={assignment.collaborationGroupSize}
          initialGradingAssistantStrictnessLevel={
            assignment.gradingAssistantStrictnessLevel
          }
        />

        {/* Same sheet, same props as the class page's "Add assignment", so
            the form reads identically from either entry point. Duplicate only
            adds the starting values it copies forward. */}
        <AssignmentCreationSheet
          open={isDuplicateSheetOpen}
          onOpenChange={setIsDuplicateSheetOpen}
          entryPoint="class"
          fixedClassId={activeClassId}
          assignmentTypes={data.assignmentTypes}
          teacherClasses={[activeClassOption]}
          initialAssignmentTypeId={assignment.assignmentTypeId}
          initialTitle={`Copy of ${assignment.title?.trim() || 'Untitled Assignment'}`}
          initialPrompt={assignment.prompt}
          initialRubricTotalPoints={assignment.rubricTotalPoints}
          initialGradingMode={assignment.gradingMode === 'bands' ? 'bands' : 'step'}
          initialParagraphModes={effectiveParagraphModes(assignment)}
        />
      </div>
    </PageShell>
  );
}
