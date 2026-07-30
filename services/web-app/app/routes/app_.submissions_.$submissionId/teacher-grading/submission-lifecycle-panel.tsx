import { type ComponentProps } from 'react';
import { Check } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import { cn } from '~/utils/misc';
import { type SubmissionLifecycleState } from '../submission-lifecycle-state';
import { TeacherGradingPanel } from './teacher-grading-panel';
import { ViewPanel, type ViewPanelSubmission } from './view-panel';

const STEPS: Array<{ state: SubmissionLifecycleState; label: string }> = [
  { state: 'needs_grading', label: 'Needs Grading' },
  { state: 'graded', label: 'Graded' },
  { state: 'released', label: 'Released' },
];

function LifecycleSteps({ current }: { current: SubmissionLifecycleState }) {
  const currentIndex = STEPS.findIndex((step) => step.state === current);
  return (
    <div
      className="flex shrink-0 items-center gap-1 px-4 pt-3 pb-2"
      data-testid="submission-lifecycle-steps"
    >
      {STEPS.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <div key={step.state} className="flex items-center gap-1">
            <div
              data-testid={`submission-lifecycle-step-${step.state}`}
              data-active={isCurrent}
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium',
                isComplete && 'border-primary bg-primary text-primary-foreground',
                isCurrent &&
                  !isComplete &&
                  'border-primary text-primary',
                !isCurrent &&
                  !isComplete &&
                  'border-muted-foreground/30 text-muted-foreground/50'
              )}
            >
              {isComplete ? <Check className="h-3 w-3" /> : index + 1}
            </div>
            <span
              className={cn(
                'text-[11px] font-medium whitespace-nowrap',
                isCurrent ? 'text-foreground' : 'text-muted-foreground/60'
              )}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 ? (
              <div className="mx-1.5 h-px w-3 shrink-0 bg-border" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

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

  return (
    <div
      className="flex h-full w-full flex-col"
      data-testid="submission-lifecycle-panel"
    >
      <LifecycleSteps current={lifecycleState} />

      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
        {lifecycleState === 'needs_grading' ? (
          <Button
            size="sm"
            data-testid="submission-lifecycle-save"
            disabled={isSavingGrade}
            onClick={onMarkGraded}
          >
            {isSavingGrade ? 'Saving...' : 'Save'}
          </Button>
        ) : isEditing ? (
          <Button
            size="sm"
            data-testid="submission-lifecycle-save"
            onClick={onDoneEditing}
          >
            Save
          </Button>
        ) : (
          <>
            <span className="text-sm font-semibold">Grade Summary</span>
            {lifecycleState === 'graded' ? (
              <Button
                size="sm"
                variant="outline"
                data-testid="submission-lifecycle-edit"
                onClick={onEdit}
              >
                Edit
              </Button>
            ) : null}
          </>
        )}
      </div>

      {lifecycleState === 'graded' ? (
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
              variant="default"
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
