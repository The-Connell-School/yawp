import { useMemo, useState } from 'react';
import {
  type LoaderFunctionArgs,
  Link,
  redirect,
  useBlocker,
  useNavigate,
  useParams,
  useRouteLoaderData,
} from 'react-router';
import { Copy, Pencil } from 'lucide-react';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { Button } from '~/components/ui/button';
import { CaretLeftIcon } from '~/components/icons';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import { AssignmentEditForm } from '~/components/assignments/assignment-edit-sheet';
import {
  AssignmentSummarySheetContent,
  type AssignmentSummarySheetAssignment,
} from '../app.my-classes.$classId/assignment-summary-sheet';
import { classAssignmentOptionLabel } from '../app.my-classes.$classId/route';
import { buildGradedCountByAssignmentId } from '../app.my-classes.$classId/graded-count';
import { mergeClassDocumentsViewPreferences } from '../app.my-classes.$classId/class-documents-view-preferences';
import type { loader as classDetailLoader } from '../app.my-classes.$classId/route';

const DISCARD_CONFIRM_MESSAGE = 'Discard your changes to this assignment?';

/**
 * Auth-only loader — the assignment data itself comes from the parent class
 * detail route's loader (`routes/app.my-classes.$classId`) via
 * useRouteLoaderData, so this nested route has a single source of truth for
 * the data instead of re-querying it. This loader exists only so a teacher
 * who deep-links straight into this URL still gets the same auth gate as
 * every other teacher route.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') {
    return redirect('/app');
  }
  return null;
}

export default function AssignmentDetailRoute() {
  const params = useParams();
  const navigate = useNavigate();
  const classId = params.classId!;
  const assignmentId = params.assignmentId!;

  const parentRouteData = useRouteLoaderData<typeof classDetailLoader>(
    'routes/app.my-classes.$classId'
  );
  // The parent route serves a student view of the same URL; this teacher-only
  // surface is never reachable from it, so anything else is treated as absent.
  const parentData =
    parentRouteData?.role === 'TEACHER' ? parentRouteData : undefined;

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [isDirty, setIsDirty] = useState(false);
  const [isDuplicateSheetOpen, setIsDuplicateSheetOpen] = useState(false);

  const backHref = `/app/my-classes/${classId}?tab=assignments`;

  const gradedCountByAssignmentId = useMemo(
    () => buildGradedCountByAssignmentId(parentData?.submissions ?? []),
    [parentData?.submissions]
  );

  const classAssignment = parentData?.assignments.find(
    (assignment) => assignment.id === assignmentId
  );

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

  if (!parentData || !classAssignment) {
    return (
      <div className="text-foreground" data-testid="assignment-detail-page">
        <div className="mb-4">
          <Button asChild variant="outline" size="sm">
            <Link to={backHref}>
              <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to assignments
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">Assignment not found.</p>
      </div>
    );
  }

  const canEdit =
    classAssignment.assignmentType.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY;

  const assignmentForContent: AssignmentSummarySheetAssignment = {
    id: classAssignment.id,
    classAssignmentId: classAssignment.classAssignmentId,
    title: classAssignment.title,
    prompt: classAssignment.prompt,
    promptAttachmentName: classAssignment.promptAttachmentName,
    submitForGrade: classAssignment.submitForGrade,
    pointValue: classAssignment.pointValue,
    assignmentType: classAssignment.assignmentType,
    documentCount: classAssignment._count.documents,
    gradedCount: gradedCountByAssignmentId.get(classAssignment.id) ?? 0,
    insight: classAssignment.insight,
  };

  const handleViewDocuments = () => {
    const next = new URLSearchParams();
    next.set('tab', 'documents');
    next.set('assignmentId', classAssignment.id);
    mergeClassDocumentsViewPreferences(next);
    navigate(`/app/my-classes/${classId}?${next.toString()}`);
  };

  const handleDuplicate = () => {
    setIsDuplicateSheetOpen(true);
  };

  const classOption = {
    id: classId,
    name: classAssignmentOptionLabel(parentData.klass),
  };

  return (
    <div className="text-foreground" data-testid="assignment-detail-page">
      <div className="mb-4">
        <Button asChild variant="outline" size="sm">
          <Link to={backHref}>
            <CaretLeftIcon className="mr-1 h-4 w-4" /> Back to assignments
          </Link>
        </Button>
      </div>

      {mode === 'view' ? (
        <>
          <AssignmentSummarySheetContent
            assignment={assignmentForContent}
            classInsightsEnabled={parentData.classInsightsEnabled === true}
            onViewDocuments={handleViewDocuments}
            renderSheet={false}
          />
          {canEdit ? (
            <div
              className="mt-6 flex items-center justify-between gap-3 border-t pt-4"
              data-testid="assignment-detail-actions"
            >
              <Button type="button" variant="ghost" onClick={handleDuplicate}>
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
            </div>
          ) : null}
        </>
      ) : (
        <AssignmentEditForm
          action={`/app/my-classes/${classId}`}
          pdfClassId={classId}
          allowedAssignmentTypes={parentData.assignmentTypes}
          editingAssignment={classAssignment}
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
      )}

      <AssignmentCreationSheet
        open={isDuplicateSheetOpen}
        onOpenChange={setIsDuplicateSheetOpen}
        entryPoint="class"
        fixedClassId={classId}
        assignmentTypes={parentData.assignmentTypes}
        teacherClasses={[classOption]}
        fixedAssignmentTypeId={classAssignment.assignmentTypeId}
        initialTitle={`Copy of ${classAssignment.title?.trim() || 'Untitled Assignment'}`}
        initialPrompt={classAssignment.prompt}
      />
    </div>
  );
}
