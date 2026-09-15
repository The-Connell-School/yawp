import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Tooltip } from '~/components/ui/tooltip';
import {
  gradingAssistantStrictnessOptions,
  type GradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import { cn } from '~/utils/misc';
import { GradeSummaryReleasedLabel } from './grade-summary-released-label';
import { type SubmissionLifecycleState } from '../submission-lifecycle-state';
import { canSaveGradingDraft } from './resolve-primary-grading-action';
import {
  TeacherGradingPanel,
  type SavedGradeSnapshot,
  type TeacherGradingPanelHeaderState,
} from './teacher-grading-panel';
import { TeacherNotes } from './teacher-notes';
import { ViewPanel, type ViewPanelSubmission } from './view-panel';

export function GradingAssistantSplitButton({
  headerState,
  isPendingStart,
  onStart,
  onAbortStart,
}: {
  headerState: TeacherGradingPanelHeaderState | null;
  isPendingStart: boolean;
  onStart: () => void;
  onAbortStart: () => void;
}) {
  const isGenerating = isPendingStart || headerState?.isGenerating === true;
  const isAiRetrying = headerState?.isAiRetrying === true;
  const isBusy = isGenerating || headerState?.isBusy === true;
  const hasDraftToReplace = headerState?.hasDraftToReplace === true;
  const gradingAssistantStrictnessLevel =
    headerState?.gradingAssistantStrictnessLevel ?? 'intermediate';
  const generateAiSuggestions =
    headerState?.generateAiSuggestions ?? (() => undefined);
  const generateAiSuggestionsAtLevel =
    headerState?.generateAiSuggestionsAtLevel ?? (() => undefined);

  const [strictnessMenuOpen, setStrictnessMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const buttonLabel = isGenerating ? (
    <span className="flex items-center gap-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {isAiRetrying ? 'Retrying...' : 'Grading...'}
    </span>
  ) : (
    'Grading Assistant Suggestions'
  );

  const runWithOptionalConfirm = (action: () => void) => {
    if (!headerState) return;
    if (hasDraftToReplace) {
      pendingActionRef.current = () => {
        onStart();
        action();
      };
      setConfirmOpen(true);
      return;
    }
    onStart();
    action();
  };

  const handleConfirm = () => {
    pendingActionRef.current?.();
    pendingActionRef.current = null;
    setConfirmOpen(false);
    setStrictnessMenuOpen(false);
  };

  const runAtLevel = (level: GradingAssistantStrictnessLevel) => {
    runWithOptionalConfirm(() => {
      generateAiSuggestionsAtLevel(level);
      setStrictnessMenuOpen(false);
    });
  };

  return (
    <>
      <div className="inline-flex items-stretch">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-r-none border-r-0"
          data-testid="grading-assistant-generate"
          disabled={isBusy || !headerState}
          onClick={() => runWithOptionalConfirm(generateAiSuggestions)}
        >
          {buttonLabel}
        </Button>

        <DropdownMenu
          open={strictnessMenuOpen}
          onOpenChange={setStrictnessMenuOpen}
        >
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-l-none border-l px-2"
              aria-label="Choose grading assistant strictness"
              data-testid="grading-assistant-strictness-menu"
              disabled={isBusy || !headerState}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 p-2">
            <DropdownMenuLabel className="px-1 pb-2 pt-0">
              Strictness
            </DropdownMenuLabel>
            <div className="space-y-1">
              {gradingAssistantStrictnessOptions.map((option) => {
                const selected =
                  gradingAssistantStrictnessLevel === option.value;
                return (
                  <Tooltip
                    key={option.value}
                    text={option.description}
                    delayDuration={200}
                    contentProps={{ side: 'left', className: 'max-w-xs' }}
                  >
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:bg-muted'
                      )}
                      aria-pressed={selected}
                      data-testid={`grading-assistant-strictness-${option.value}`}
                      onClick={() => runAtLevel(option.value)}
                    >
                      <span className="flex-1 font-medium">{option.label}</span>
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Replace Existing Grading Feedback?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Grading Assistant suggestions will replace all current rubric
              comments, overall feedback, and grammar issue suggestions.
              Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onAbortStart}>
              Go Back
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SaveButton({
  saveEnabled,
  isSavingGrade,
  isSavingDraft,
  onSave,
}: {
  saveEnabled: boolean;
  isSavingGrade: boolean;
  isSavingDraft: boolean;
  onSave: () => void;
}) {
  return (
    <Button
      size="sm"
      data-testid="submission-lifecycle-save"
      disabled={!saveEnabled || isSavingGrade || isSavingDraft}
      onClick={() => void onSave()}
    >
      {isSavingGrade || isSavingDraft ? 'Saving...' : 'Save'}
    </Button>
  );
}

export function SubmissionLifecyclePanel({
  lifecycleState,
  isEditingGrade,
  onEditingGradeChange,
  onMarkGraded,
  onGradeSaved,
  isSavingGrade,
  onRelease,
  isReleasing,
  submissionForView,
  submissionActivityEnabled = false,
  submissionId,
  documentId,
  teacherNote = null,
  onNavigationStateChange,
  ...teacherGradingPanelProps
}: {
  lifecycleState: SubmissionLifecycleState;
  isEditingGrade: boolean;
  onEditingGradeChange: (isEditing: boolean) => void;
  onMarkGraded: () => Promise<void>;
  onGradeSaved: (snapshot: SavedGradeSnapshot) => void;
  isSavingGrade: boolean;
  onRelease: () => void;
  isReleasing: boolean;
  submissionForView: ViewPanelSubmission;
  submissionActivityEnabled?: boolean;
  submissionId: string;
  documentId: string;
  teacherNote?: string | null;
  onNavigationStateChange?: (state: {
    hasUnsavedChanges: boolean;
    isBusy: boolean;
  }) => void;
} & ComponentProps<typeof TeacherGradingPanel>) {
  const isWithdrawn = (submissionForView as any)?.unsubmittedAt != null;
  const label = isWithdrawn
    ? 'Withdrawn'
    : lifecycleState === 'needs_grading'
      ? 'Grading'
      : 'Grade Summary';
  const isReadyToRelease =
    !isWithdrawn && lifecycleState === 'graded' && !isEditingGrade;
  const releasedEditEnabled =
    !isWithdrawn && lifecycleState === 'released' && submissionActivityEnabled;
  const showEditingForm =
    !isWithdrawn &&
    (lifecycleState === 'needs_grading' ||
      (lifecycleState === 'graded' && isEditingGrade) ||
      (releasedEditEnabled && isEditingGrade));
  const [headerState, setHeaderState] =
    useState<TeacherGradingPanelHeaderState | null>(null);
  const [isGradingAssistantPending, setIsGradingAssistantPending] =
    useState(false);
  const wasGeneratingRef = useRef(false);

  useEffect(() => {
    onNavigationStateChange?.({
      hasUnsavedChanges:
        showEditingForm && headerState?.hasUnsavedChanges === true,
      isBusy: isSavingGrade || isReleasing || headerState?.isBusy === true,
    });
  }, [
    onNavigationStateChange,
    showEditingForm,
    headerState?.hasUnsavedChanges,
    headerState?.isBusy,
    isSavingGrade,
    isReleasing,
  ]);
  useEffect(
    () => () =>
      onNavigationStateChange?.({ hasUnsavedChanges: false, isBusy: false }),
    [onNavigationStateChange]
  );

  useEffect(() => {
    if (!showEditingForm) {
      setHeaderState(null);
      setIsGradingAssistantPending(false);
      wasGeneratingRef.current = false;
    }
  }, [showEditingForm]);

  useEffect(() => {
    const generating = headerState?.isGenerating === true;
    if (wasGeneratingRef.current && !generating) {
      setIsGradingAssistantPending(false);
    }
    wasGeneratingRef.current = generating;
  }, [headerState?.isGenerating]);

  const saveEnabled = headerState
    ? canSaveGradingDraft({
        lifecycleState,
        hasDraftToReplace: headerState.hasDraftToReplace,
        hasUnsavedChanges: headerState.hasUnsavedChanges,
        hasGrade: headerState.hasGrade,
        releasedEditEnabled,
      })
    : false;

  const exitEditMode = () => {
    onEditingGradeChange(false);
  };

  const handleSave = async () => {
    if (!headerState || !saveEnabled) return;
    let draftSaved = false;
    try {
      await headerState.saveDraft();
      draftSaved = true;
      if (lifecycleState === 'needs_grading' && headerState.hasGrade) {
        await onMarkGraded();
      }
      // Revalidate only after the final lifecycle mutation. Marking graded
      // advances Submission.updatedAt, so revalidating after saveDraft but
      // before onMarkGraded could leave the next edit with a stale token.
      onGradeSaved(headerState.getSavedGradeSnapshot());
    } catch (err) {
      // The server refuses this write (e.g. the student unsubmitted while
      // this panel was open). Surface exactly why, and kick the teacher
      // back out of a form that will never save rather than leaving them
      // stuck retrying it.
      toast.error(err instanceof Error ? err.message : 'Save failed.');
      if (!draftSaved) {
        headerState.discardDraft();
      }
      exitEditMode();
      return;
    }
    exitEditMode();
  };

  const hasUnsavedChanges = headerState?.hasUnsavedChanges === true;
  const dismissLabel = hasUnsavedChanges ? 'Cancel' : 'Done';

  const handleCancel = () => {
    if (!headerState) return;
    if (hasUnsavedChanges) {
      headerState.discardDraft();
    }
    exitEditMode();
  };

  return (
    <div
      className="flex h-full w-full flex-col"
      data-testid="submission-lifecycle-panel"
    >
      <div className="shrink-0 border-b px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{label}</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {lifecycleState === 'released' && !isWithdrawn ? (
              <GradeSummaryReleasedLabel />
            ) : null}
            {releasedEditEnabled && !isEditingGrade && !isWithdrawn ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="submission-lifecycle-edit"
                onClick={() => onEditingGradeChange(true)}
              >
                Edit
              </Button>
            ) : null}
            {isReadyToRelease && !isWithdrawn ? (
              <>
                <ConfirmationDialog
                  title="Release Grade?"
                  description="This will make the grade and all feedback visible to the student. This action cannot be undone."
                  confirmText="Release"
                  cancelText="Cancel"
                  onConfirm={() => void onRelease()}
                >
                  <Button
                    size="sm"
                    data-testid="submission-lifecycle-release"
                    disabled={isReleasing}
                  >
                    {isReleasing ? 'Releasing...' : 'Release Grade'}
                  </Button>
                </ConfirmationDialog>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="submission-lifecycle-edit"
                  onClick={() => onEditingGradeChange(true)}
                >
                  Edit
                </Button>
              </>
            ) : null}
            {showEditingForm && lifecycleState !== 'released' ? (
              <GradingAssistantSplitButton
                headerState={headerState}
                isPendingStart={isGradingAssistantPending}
                onStart={() => setIsGradingAssistantPending(true)}
                onAbortStart={() => setIsGradingAssistantPending(false)}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {isWithdrawn ? (
          <div className="p-4 text-sm">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="font-medium">This submission was withdrawn.</p>
              {'unsubmittedAt' in (submissionForView as any) &&
              (submissionForView as any).unsubmittedAt ? (
                <p className="mt-1 text-muted-foreground">
                  Withdrawn at{' '}
                  {new Date(
                    (submissionForView as any).unsubmittedAt as string
                  ).toLocaleString()}
                </p>
              ) : null}
            </div>
          </div>
        ) : showEditingForm ? (
          <>
            {lifecycleState === 'released' ? (
              <div
                className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                role="status"
                data-testid="released-grade-edit-warning"
              >
                Saving immediately changes the grade and feedback visible to the
                student and records the change in Activity.
              </div>
            ) : null}
            <TeacherNotes note={teacherNote} variant="inline" />
            <TeacherGradingPanel
              {...teacherGradingPanelProps}
              documentId={documentId}
              submissionId={submissionId}
              hideHeader
              onHeaderStateChange={setHeaderState}
            />
          </>
        ) : isReadyToRelease || lifecycleState === 'released' ? (
          <>
            <ViewPanel submission={submissionForView} />
            <TeacherNotes note={teacherNote} variant="inline" />
          </>
        ) : null}
      </div>

      {showEditingForm ? (
        <div className="shrink-0 border-t bg-white px-4 py-2.5 dark:bg-background">
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="submission-lifecycle-cancel"
              disabled={
                headerState?.isBusy ||
                (lifecycleState === 'needs_grading' && !hasUnsavedChanges)
              }
              onClick={handleCancel}
            >
              {dismissLabel}
            </Button>
            <SaveButton
              saveEnabled={saveEnabled}
              isSavingGrade={isSavingGrade}
              isSavingDraft={headerState?.isSavingDraft ?? false}
              onSave={handleSave}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
