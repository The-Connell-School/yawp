import { type ComponentProps } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import { type SubmissionLifecycleState } from '../submission-lifecycle-state';
import { TeacherGradingPanel } from './teacher-grading-panel';
import { ViewPanel, type ViewPanelSubmission } from './view-panel';

export function SubmissionLifecyclePanel({
  lifecycleState,
  isEditing,
  onEdit,
  onDoneEditing,
  onMarkGraded,
  isSavingGrade,
  onRelease,
  isReleasing,
  submissionForView,
  ...teacherGradingPanelProps
}: {
  lifecycleState: SubmissionLifecycleState;
  isEditing: boolean;
  onEdit: () => void;
  onDoneEditing: () => void;
  onMarkGraded: () => void;
  isSavingGrade: boolean;
  onRelease: () => void;
  isReleasing: boolean;
  submissionForView: ViewPanelSubmission;
} & ComponentProps<typeof TeacherGradingPanel>) {
  const showForm = lifecycleState === 'needs_grading' || isEditing;
  const label = lifecycleState === 'needs_grading' ? 'Grading' : 'Grade Summary';
  const canEdit = lifecycleState === 'graded' && !isEditing;

  return (
    <div
      className="flex h-full w-full flex-col"
      data-testid="submission-lifecycle-panel"
    >
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-semibold">{label}</span>
        {canEdit ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Edit grade"
            data-testid="submission-lifecycle-edit"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      {/* Exactly one action at a time, driven by the current lifecycle state. */}
      {lifecycleState === 'needs_grading' ? (
        <div className="shrink-0 border-b px-4 py-2.5">
          <Button
            size="sm"
            className="w-full"
            data-testid="submission-lifecycle-save"
            disabled={isSavingGrade}
            onClick={onMarkGraded}
          >
            {isSavingGrade ? 'Saving...' : 'Save'}
          </Button>
        </div>
      ) : lifecycleState === 'graded' && isEditing ? (
        <div className="shrink-0 border-b px-4 py-2.5">
          <Button
            size="sm"
            className="w-full"
            data-testid="submission-lifecycle-save"
            onClick={onDoneEditing}
          >
            Save
          </Button>
        </div>
      ) : lifecycleState === 'graded' ? (
        <div className="shrink-0 border-b px-4 py-2.5">
          <ConfirmationDialog
            title="Release Grade?"
            description="This will make the grade and all feedback visible to the student. This action cannot be undone."
            confirmText="Release"
            cancelText="Cancel"
            onConfirm={onRelease}
          >
            <Button
              size="sm"
              className="w-full"
              data-testid="submission-lifecycle-release"
              disabled={isReleasing}
            >
              {isReleasing ? 'Releasing...' : 'Release Grade'}
            </Button>
          </ConfirmationDialog>
        </div>
      ) : null}

      <div className="no-scrollbar grow overflow-y-auto">
        {showForm ? (
          <TeacherGradingPanel {...teacherGradingPanelProps} />
        ) : (
          <ViewPanel submission={submissionForView} />
        )}
      </div>
    </div>
  );
}
