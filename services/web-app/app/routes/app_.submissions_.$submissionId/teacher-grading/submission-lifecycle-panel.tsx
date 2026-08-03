import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { ChevronDown, Info, Loader2 } from 'lucide-react';
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
import { ViewPanel, type ViewPanelSubmission } from './view-panel';

function GradingAssistantSplitButton({
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
  const isGenerating =
    isPendingStart || headerState?.isGenerating === true;
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

        <DropdownMenu open={strictnessMenuOpen} onOpenChange={setStrictnessMenuOpen}>
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
                  <button
                    key={option.value}
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
                    <Tooltip
                      text={option.description}
                      delayDuration={200}
                      contentProps={{ side: 'left', className: 'max-w-xs' }}
                    >
                      <span
                        className="inline-flex shrink-0"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Info
                          className={cn(
                            'h-4 w-4',
                            selected
                              ? 'text-primary-foreground/80'
                              : 'text-muted-foreground'
                          )}
                          aria-label={`About ${option.label} strictness`}
                        />
                      </span>
                    </Tooltip>
                  </button>
                );
              })}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace Existing Grading Feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              Grading Assistant suggestions will replace all current rubric
              comments, overall feedback, and grammar issue suggestions.
              Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onAbortStart}>Go Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Replace</AlertDialogAction>
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
} & ComponentProps<typeof TeacherGradingPanel>) {
  const label = lifecycleState === 'needs_grading' ? 'Grading' : 'Grade Summary';
  const isReadyToRelease =
    lifecycleState === 'graded' && !isEditingGrade;
  const showEditingForm =
    lifecycleState === 'needs_grading' ||
    (lifecycleState === 'graded' && isEditingGrade);
  const [headerState, setHeaderState] =
    useState<TeacherGradingPanelHeaderState | null>(null);
  const [isGradingAssistantPending, setIsGradingAssistantPending] =
    useState(false);
  const wasGeneratingRef = useRef(false);

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
        hasNumericPercentage: headerState.hasNumericPercentage,
      })
    : false;

  const exitEditMode = () => {
    onEditingGradeChange(false);
  };

  const handleSave = async () => {
    if (!headerState || !saveEnabled) return;
    await headerState.saveDraft();
    onGradeSaved(headerState.getSavedGradeSnapshot());
    if (
      lifecycleState === 'needs_grading' &&
      headerState.hasNumericPercentage
    ) {
      await onMarkGraded();
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
          {lifecycleState === 'released' ? (
            <GradeSummaryReleasedLabel />
          ) : null}
          {isReadyToRelease ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
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
            </div>
          ) : null}
          {showEditingForm ? (
            <GradingAssistantSplitButton
              headerState={headerState}
              isPendingStart={isGradingAssistantPending}
              onStart={() => setIsGradingAssistantPending(true)}
              onAbortStart={() => setIsGradingAssistantPending(false)}
            />
          ) : null}
        </div>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {showEditingForm ? (
          <TeacherGradingPanel
            {...teacherGradingPanelProps}
            hideHeader
            onHeaderStateChange={setHeaderState}
          />
        ) : isReadyToRelease || lifecycleState === 'released' ? (
          <ViewPanel submission={submissionForView} />
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
