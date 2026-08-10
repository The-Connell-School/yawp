import { useState, type MouseEvent } from 'react';
import {
  type LoaderFunctionArgs,
  Link,
  redirect,
  useBlocker,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from 'react-router';
import { Copy, Pencil } from 'lucide-react';
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
import { AssignmentEditForm } from '~/components/assignments/assignment-edit-sheet';
import { formatClassLabel } from '~/utils/class-display';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import {
  AssignmentSummarySheetContent,
  type AssignmentSummarySheetAssignment,
} from '../app.my-classes.$classId/assignment-summary-sheet';
import { mergeClassDocumentsViewPreferences } from '../app.my-classes.$classId/class-documents-view-preferences';
import type { ClassInsightSummary } from '~/domain/assignment-insights/class-insight-synthesis';

const DISCARD_CONFIRM_MESSAGE = 'Discard your changes to this assignment?';

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
          assignmentTypeId: true,
          assignmentType: {
            select: { id: true, title: true, systemKey: true },
          },
        },
      },
      _count: { select: { documents: true } },
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
    }>({
      scopes: [
        {
          organizationId: active.class.school.organizationId,
          schoolId: active.class.school.id,
          teacherProfileId: profile.id,
        },
      ],
      select: { id: true, title: true, systemKey: true },
      orderBy: { position: 'asc' },
    }),
  ]);

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
    assignmentTypes,
    activeClassId: active.classId,
    classes: deployments.map((deployment) => ({
      id: deployment.classId,
      name: formatClassLabel(deployment.class),
    })),
    assignment: {
      id: active.assignment.id,
      classAssignmentId: active.id,
      title: active.assignment.title,
      prompt: active.assignment.prompt,
      promptAttachmentName: active.assignment.promptAttachmentName,
      submitForGrade: active.assignment.submitForGrade,
      pointValue: active.assignment.pointValue,
      assignmentTypeId: active.assignment.assignmentTypeId,
      assignmentType: active.assignment.assignmentType,
      documentCount: active._count.documents,
      gradedCount,
      insight,
    },
  };
}

export default function AssignmentDetailRoute() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [isDirty, setIsDirty] = useState(false);
  const [isDuplicateSheetOpen, setIsDuplicateSheetOpen] = useState(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      mode === 'edit' &&
      isDirty &&
      currentLocation.pathname !== nextLocation.pathname
  );

  if (blocker.state === 'blocked') {
    if (window.confirm(DISCARD_CONFIRM_MESSAGE)) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }

  if (!data.found) {
    return (
      <div className="text-foreground" data-testid="assignment-detail-page">
        <div className="mb-4">
          <Button asChild variant="outline" size="sm">
            <Link to="/app/assignments">
              <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to assignments
            </Link>
          </Button>
        </div>

        <div className="rounded-xl bg-card p-6 text-center ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Assignment not found.</p>
        </div>
      </div>
    );
  }

  const { assignment, activeClassId, classes } = data;
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
  };

  const handleViewDocuments = () => {
    const next = new URLSearchParams();
    next.set('tab', 'documents');
    next.set('assignmentId', assignment.id);
    mergeClassDocumentsViewPreferences(next);
    navigate(`/app/my-classes/${activeClassId}?${next.toString()}`);
  };

  const handleClassChange = (classId: string) => {
    if (isDirty && !window.confirm(DISCARD_CONFIRM_MESSAGE)) return;
    setMode('view');
    setIsDirty(false);
    const next = new URLSearchParams(searchParams);
    next.set('classId', classId);
    setSearchParams(next, { replace: true });
  };

  const documentCount = assignment.documentCount;

  return (
    <div className="text-foreground" data-testid="assignment-detail-page">
      <div className="mb-4">
        <Button asChild variant="outline" size="sm">
          <Link to={backHref} onClick={handleBack}>
            <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to assignments
          </Link>
        </Button>
      </div>

      {mode === 'view' ? (
        <>
          <div className="mb-6 overflow-hidden rounded-xl bg-card ring-1 ring-border">
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
                      onClick={() => setMode('edit')}
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
      ) : (
        <div className="rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
          <AssignmentEditForm
            action={`/app/my-classes/${activeClassId}`}
            pdfClassId={activeClassId}
            allowedAssignmentTypes={data.assignmentTypes}
            editingAssignment={assignment}
            onSaved={() => {
              setMode('view');
              setIsDirty(false);
            }}
            onBack={() => {
              if (isDirty && !window.confirm(DISCARD_CONFIRM_MESSAGE)) return;
              setMode('view');
              setIsDirty(false);
            }}
            onDirtyChange={setIsDirty}
            renderSheet={false}
          />
        </div>
      )}

      <AssignmentCreationSheet
        open={isDuplicateSheetOpen}
        onOpenChange={setIsDuplicateSheetOpen}
        entryPoint="class"
        fixedClassId={activeClassId}
        assignmentTypes={data.assignmentTypes}
        teacherClasses={classes}
        fixedAssignmentTypeId={assignment.assignmentTypeId}
        initialTitle={`Copy of ${assignment.title?.trim() || 'Untitled Assignment'}`}
        initialPrompt={assignment.prompt}
      />
    </div>
  );
}
