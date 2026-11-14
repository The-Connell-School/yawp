import { useFreeAccountUsage } from '~/components/free-account-usage';
import { freeAssignmentKindUsageMeta } from '~/domain/free-tier/inapp-usage';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type * as React from 'react';
import { useFetcher, useNavigate } from 'react-router';
import { Check, Lock, FileUp, Loader2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  DEFAULT_COLLABORATION_GROUP_MODE,
  DEFAULT_COLLABORATION_GROUP_SIZE,
  collaborationModeNeedsGroupSize,
  type CollaborationGroupMode,
} from '~/domain/assignments/collaboration';
import { assignmentBuilderV3ShowGroupProjectToggle } from '~/domain/assignments/assignment-builder-v3-group-project';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import {
  DEFAULT_EXIT_TICKET_MODE,
  DEFAULT_EXIT_TICKET_REFLECTION_PROMPT,
  DEFAULT_EXIT_TICKET_GRADING_BASIS,
  exitTicketCriteriaNoteKeys,
  exitTicketKindForMode,
  EXIT_TICKET_ANSWER_TYPE_OPTIONS,
  EXIT_TICKET_ANSWER_TYPES,
  EXIT_TICKET_FOCUS_OPTIONS,
  EXIT_TICKET_DEFAULT_POINT_VALUE,
  EXIT_TICKET_LESSON_NOTE_FIELDS,
  EXIT_TICKET_LESSON_NOTE_MAX_LENGTH,
  EXIT_TICKET_SUBMIT_FOR_GRADE_DEFAULT,
  EXIT_TICKET_TOPIC_MAX_LENGTH,
  EXIT_TICKET_TUTOR_ENABLED_DEFAULT,
  composeExitTicketPrompt,
  defaultExitTicketLessonNotesEnabled,
  EXIT_TICKET_CONFIG_SCHEMA_VERSION,
  exitTicketActivityKind,
  exitTicketStarterOption,
  exitTicketV3DraftFromConfig,
  type ExitTicketConfig,
  type ExitTicketV3Draft,
  exitTicketFocusOption,
  exitTicketTargetingHint,
  isExitTicketAssignmentType,
  parseExitTicketConfigInput,
  type ExitTicketAnswerType,
  type ExitTicketFocus,
  type ExitTicketLessonNotes,
  type ExitTicketMode,
  type ExitTicketReflectionPrompt,
  type ExitTicketGrading,
  type ExitTicketReflectionPromptId,
} from '~/domain/assignment-types/exit-ticket';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Textarea } from '~/components/ui/textarea';
import {
  AssignmentCreatedSuccessPanel,
  type AssignmentCreatedSuccessState,
} from '~/components/assignments/assignment-created-success-panel';
import {
  resolveNewAssignmentPointValue,
  type AssignmentTypeDefaultContext,
} from '~/domain/assignments/new-assignment-defaults';
import { SAVED_ASSIGNMENTS_ENABLED } from '~/domain/assignments/saved-assignments';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  gradingAssistantStrictnessOptions,
  type GradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import {
  DEFAULT_ASSIGNMENT_GRADING_MODE,
  type AssignmentGradingMode,
} from '~/domain/assignments/rubric-overrides';
import { Tooltip } from '~/components/ui/tooltip';
import {
  ExitTicketBuilder,
  ExitTicketLessonNotesSection,
  WhyDisclosure,
  type ExitTicketGradingDraft,
} from './exit-ticket-builder';
import { ExitTicketBuilderV3 } from './exit-ticket-builder-v3';
import { cn } from '~/utils/misc';
import { SiteLicenseLockedAssignmentTile } from '~/components/site-license-locked-assignment-tile';
import type { SiteLicenseLockedAssignmentTile as SiteLicenseLockedTile } from '~/domain/free-tier/site-license-locked-assignment-tiles';
import { AssignmentTypeSearchSelect } from '~/components/assignments/assignment-type-search-select';
import { AssignmentTypeTileImage } from '~/components/assignment-type-tile-image';
import { toDateInputValue } from '~/utils/date-only';
import {
  assignmentTypeUsesDailyPagesEngagementRubric,
  MIN_DAILY_PAGES_ENGAGEMENT_POINT_TOTAL,
} from '~/domain/assignment-types/daily-pages-engagement-rubric';
import {
  dailyPagesEngagementTierBands,
  formatDailyPagesEngagementBandRange,
} from '~/domain/assignment-types/daily-pages-engagement-tier-bands';

/**
 * A segmented control in the shape of the app's pill buttons: a recessed track
 * with the chosen option lifted back out of it. Selection reads from fill and
 * elevation rather than a solid brand block, and the font weight never changes
 * between states so the row cannot reflow as a teacher clicks across it.
 *
 * Each option carries its explanation on hover; the chosen one is spelled out
 * underneath the control.
 */
function GradingChoiceGroup<Value extends string>({
  labelId,
  value,
  options,
  onChange,
  disabled,
  idPrefix,
}: {
  labelId: string;
  value: Value;
  options: ReadonlyArray<{ value: Value; label: string; description: string }>;
  onChange: (next: Value) => void;
  disabled: boolean;
  idPrefix?: string;
}) {
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn(
        'grid gap-1 rounded-full bg-secondary p-1',
        options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Tooltip key={option.value} text={option.description}>
            <button
              id={idPrefix ? `${idPrefix}-${option.value}` : undefined}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              disabled={disabled}
              className={cn(
                'h-8 rounded-full px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50',
                selected
                  ? 'bg-popover text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * A closed "More options" disclosure when enabled; its children unchanged
 * otherwise. A native <details> keeps everything inside mounted, so every
 * field still posts whether or not the teacher opened it.
 */
/** Radix checkboxes are buttons, not native inputs, so form posts need a hidden value. */
function BooleanFormValue({
  name,
  value,
}: {
  name: string;
  value: boolean;
}) {
  return (
    <input type="hidden" name={name} value={value ? 'true' : 'false'} />
  );
}

function MoreOptions({
  enabled,
  open,
  onOpenChange,
  children,
}: {
  enabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <details
      id="assignment-create-exit-ticket-more-options"
      className="rounded-md border px-3 py-2"
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary className="cursor-pointer select-none py-1 text-sm font-medium">
        More options
      </summary>
      {children}
    </details>
  );
}

export type AssignmentCreationEntryPoint =
  | 'dashboard'
  | 'assignment-type'
  | 'class';

export type AssignmentCreationAssignmentType = {
  id: string;
  title: string;
  /**
   * Whether this kind of writing is in the collaborative-drafts pilot. Required
   * rather than optional so a new call site cannot silently drop the toggle: an
   * absent flag would look exactly like an unsupported type.
   */
  collaborationSupported: boolean;
  /**
   * Whether this kind of writing is graded for grammar and syntax at all.
   * Required for the same reason `collaborationSupported` is: an absent flag
   * would look exactly like a type that does not grade grammar, and the
   * teacher would silently lose the toggle.
   */
  gradesGrammar: boolean;
  /**
   * `AssignmentType.kind`, which decides whether this type gets a prompt box or
   * a form. Required for the same reason as the flag above: a call site that
   * forgot to load it would render an exit ticket as a blank prompt.
   */
  kind: string | null;
  imageId?: string | null;
  imageTitle?: string | null;
  /** Library rubric name when the type points at a shared rubric (e.g. SJP Daily Pages). */
  rubricName?: string | null;
  /** Displayed for a catalog type excluded by the organization plan. */
  unavailableReason?: string;
  /** Free classroom bundle: assignments remaining for this kind. */
  quotaRemaining?: number;
  quotaTotal?: number;
  quotaLabel?: string;
  quotaExhausted?: boolean;
  quotaExhaustedMessage?: string;
};

/**
 * An assignment type that is not written in this sheet but built from its own
 * library (AP History: a curated prompt and source set). It is listed with the
 * other types so the teacher finds it where every type lives; choosing it
 * closes the sheet and opens `href`.
 */
export type AssignmentCreationLibraryType = {
  id: string;
  title: string;
  /** Shown under the title in the type list, e.g. "Opens the AP prompt library". */
  description: string;
  href: string;
};

export type AssignmentCreationEditingAssignment = {
  id: string;
  promptAttachmentName?: string | null;
  assignmentTypeLocked?: boolean;
};

export type AssignmentCreationClassOption = {
  id: string;
  name?: string;
  title?: string | null;
  grade?: string | null;
  period?: string | null;
  studentCount?: number;
};

type CreateFetcherData = {
  success?: boolean;
  message?: string;
  assignmentId?: string;
  /**
   * Where the teacher still has to go. Present only for collaborative
   * assignments, which are not finished at creation: students see nothing until
   * groups are opened.
   */
  nextStep?: { url: string; classCount: number } | null;
};

type ExtractFetcherData = CreateFetcherData & {
  title?: string;
  prompt?: string;
  truncated?: boolean;
};

type AssignmentCreationFetcher<Data> = {
  state: string;
  data?: Data | null;
  Form: React.ComponentType<any>;
  submit?: (...args: any[]) => void;
};

export type AssignmentCreationSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Told once an assignment is created, so a lesson that sent the teacher
   * here can say "Created in Yawp!" (Brian's run 3, item 4). Optional.
   */
  /** `nextStep`: the sheet is going on to another page (groups to set up). */
  onCreated?: (info: { nextStep: boolean }) => void;
  entryPoint: AssignmentCreationEntryPoint;
  assignmentTypes: AssignmentCreationAssignmentType[];
  /**
   * Types built from their own library rather than this form (flag
   * `ap-history-in-new-assignment`). Never offered while editing.
   */
  libraryAssignmentTypes?: AssignmentCreationLibraryType[];
  siteLicenseLockedAssignmentTiles?: SiteLicenseLockedTile[];
  teacherClasses: AssignmentCreationClassOption[];
  fixedAssignmentTypeId?: string;
  initialAssignmentTypeId?: string;
  fixedClassId?: string;
  /** Class ids to preselect on open when the class is not fixed (e.g. duplicate). */
  initialClassIds?: string[];
  /** Restyles the assign-to list for Duplicate (presentation). */
  assignToVariant?: 'default' | 'duplicate';
  /** Optional teacher class list for Duplicate; falls back to teacherClasses. */
  duplicateClasses?: AssignmentCreationClassOption[];
  /**
   * Present when this sheet is editing an existing assignment rather than
   * creating one. Same form either way — it swaps the intent, drops the
   * class picker (the assignment is already deployed), and freezes the
   * settings that cannot change once students have documents.
   */
  editingAssignment?: AssignmentCreationEditingAssignment;
  initialTitle?: string;
  initialPrompt?: string;
  emptyClassesMessage?: string;
  /** When true, a title must be entered before the assignment can be created. */
  titleRequired?: boolean;
  /** Optional initial post/visible date (applies to selected classes). */
  initialPostAt?: Date | string | null;
  /** Optional initial due date (applies to selected classes). */
  initialDueAt?: Date | string | null;
  /**
   * Grading and tutor settings to start from. Reusing a saved assignment
   * carries its whole configuration back into the sheet, not just its prompt.
   */
  initialSubmitForGrade?: boolean;
  initialPointValue?: number | null;
  initialTutorEnabled?: boolean;
  initialCollaborationEnabled?: boolean;
  initialCollaborationGroupMode?: CollaborationGroupMode;
  initialCollaborationGroupSize?: number | null;
  initialGradingAssistantStrictnessLevel?: GradingAssistantStrictnessLevel;
  initialRubricTotalPoints?: number | null;
  initialGradingMode?: AssignmentGradingMode;
  /** The rubric's authored total, shown before an assignment override is used. */
  /**
   * Exit ticket answers to start from. Only meaningful when the selected type
   * is an exit ticket; editing one reopens the form on what was chosen rather
   * than resetting it to the default.
   */
  initialExitTicketMode?: ExitTicketMode;
  /**
   * Whether a new exit ticket starts graded, and for how much. Set only by
   * the Lesson Planner hand-off; without it a new ticket starts ungraded.
   */
  initialExitTicketGradebook?: {
    submitForGrade: boolean;
    pointValue: number | null;
  } | null;
  /** What a stored graded ticket was graded on; null for ungraded. */
  initialExitTicketGrading?: ExitTicketGrading | null;
  /** The reflection question a stored ticket asks; null for the default. */
  initialExitTicketReflectionPrompt?: ExitTicketReflectionPrompt | null;
  initialExitTicketFocus?: ExitTicketFocus;
  initialExitTicketTopic?: string;
  /** Absent leaves the question unanswered, which is what blocks submission. */
  initialExitTicketAnswerType?: ExitTicketAnswerType | null;
  /** Present reopens the notes section filled in; absent leaves the default. */
  initialExitTicketLessonNotes?: ExitTicketLessonNotes | null;
  /**
   * The v3 exit ticket builder (flag `exit-ticket-builder-v3`). Off renders
   * the quick builder. Either reads tickets the other wrote.
   */
  exitTicketBuilderV3Enabled?: boolean;
  /**
   * A stored ticket's whole config, for the v3 builder to reopen exactly,
   * activity and prompt included. The quick builder reads the fields above.
   */
  initialExitTicketConfig?: ExitTicketConfig | null;
  teachingLocked?: boolean;
  createAssignmentTriggerRef?: React.RefObject<HTMLButtonElement | null>;
};

type AssignmentCreationSheetContentProps = AssignmentCreationSheetProps & {
  createFetcher: AssignmentCreationFetcher<CreateFetcherData>;
  extractFetcher: AssignmentCreationFetcher<ExtractFetcherData>;
  /** Injectable so the content is testable without a router. */
  navigate?: (to: string) => void;
  renderSheet?: boolean;
};

export function assignmentCreationClassLabel(
  klass: AssignmentCreationClassOption
) {
  if (klass.name?.trim()) return klass.name;
  if (klass.title?.trim()) return klass.title;

  const grade = klass.grade?.trim();
  const period = klass.period?.trim();

  if (grade && period) return `Grade ${grade} - Period ${period}`;
  if (grade) return `Grade ${grade}`;
  if (period) return `Period ${period}`;
  return 'Untitled Class';
}

function initialAssignmentTypeSelection(
  assignmentTypes: AssignmentCreationAssignmentType[],
  fixedAssignmentTypeId?: string,
  initialAssignmentTypeId?: string,
  isEditing = false
) {
  const preferredId =
    fixedAssignmentTypeId ?? initialAssignmentTypeId ?? undefined;
  // Creation availability can change after an assignment is posted. Preserve
  // its current type for ordinary edits; selecting a replacement still requires
  // an available catalog type.
  if (isEditing && preferredId) return preferredId;
  if (preferredId) {
    const preferred = assignmentTypes.find((type) => type.id === preferredId);
    if (
      preferred &&
      !preferred.quotaExhausted &&
      !preferred.unavailableReason
    ) {
      return preferredId;
    }
  }
  const firstAvailable = assignmentTypes.find(
    (type) => !type.quotaExhausted && !type.unavailableReason
  );
  return firstAvailable?.id ?? '';
}

function initialClassIds(
  fixedClassId?: string,
  presetClassIds?: string[]
) {
  return fixedClassId ? [fixedClassId] : (presetClassIds ?? []);
}

/** The point-value input is a string; a saved assignment may carry none. */
function pointValueFieldValue(pointValue: number | null | undefined) {
  return pointValue === null || pointValue === undefined
    ? ''
    : String(pointValue);
}

function gradingDraftFor(
  grading: ExitTicketGrading | null | undefined
): ExitTicketGradingDraft {
  return {
    basis: grading?.basis ?? DEFAULT_EXIT_TICKET_GRADING_BASIS,
    minWords: grading?.minWords ? String(grading.minWords) : '',
    minSentences: grading?.minSentences ? String(grading.minSentences) : '',
    assessFor: grading?.assessFor ?? '',
  };
}

/** Whether the lesson notes start open — only when there is already content. */
function initialLessonNotesEnabled(
  notes: ExitTicketLessonNotes | null | undefined
) {
  return Boolean(notes);
}

/**
 * What the v3 builder opens on. A stored config wins; otherwise the quick
 * builder's starting answers (the Lesson Planner hand-off sends those) are
 * read as the ticket they describe. A check without a topic is not yet a
 * ticket, so it opens on the default reflection.
 */
export function initialExitTicketV3Draft({
  config,
  mode,
  reflectionPrompt,
  focus,
  topic,
  answerType,
}: {
  config: ExitTicketConfig | null;
  mode: ExitTicketMode;
  reflectionPrompt: ExitTicketReflectionPrompt | null;
  focus: ExitTicketFocus;
  topic: string;
  answerType: ExitTicketAnswerType | null;
}): ExitTicketV3Draft {
  if (config) return exitTicketV3DraftFromConfig(config);
  if (mode === 'specific') {
    return topic.trim()
      ? exitTicketV3DraftFromConfig({
          schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
          mode: 'specific',
          focus,
          topic,
          answerType: answerType ?? 'subjective',
        })
      : exitTicketV3DraftFromConfig(null);
  }
  return exitTicketV3DraftFromConfig(
    reflectionPrompt
      ? {
          schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
          mode: 'basic',
          reflectionPrompt,
        }
      : null
  );
}

const EMPTY_LESSON_NOTES: ExitTicketLessonNotes = {
  mainPoints: '',
  mustMention: '',
  watchFor: '',
};

function isExitTicketTypeId(
  assignmentTypes: AssignmentCreationAssignmentType[],
  assignmentTypeId: string
) {
  return isExitTicketAssignmentType(
    assignmentTypes.find((type) => type.id === assignmentTypeId)
  );
}

function assignmentTypeContextFor(
  assignmentTypes: AssignmentCreationAssignmentType[],
  assignmentTypeId: string
): AssignmentTypeDefaultContext {
  const type = assignmentTypes.find((entry) => entry.id === assignmentTypeId);
  return {
    kind: type?.kind ?? null,
    rubricName: type?.rubricName ?? null,
  };
}

/**
 * What the tutor toggle starts at. Editing keeps whatever the assignment has —
 * the toggle is frozen after creation anyway. Otherwise an exit ticket starts
 * off, where every other type starts on: a tutor in the document would be
 * answering the question the ticket is asking.
 */
export function initialTutorEnabledFor({
  isEditing,
  isExitTicket,
  initialTutorEnabled,
}: {
  isEditing: boolean;
  isExitTicket: boolean;
  initialTutorEnabled: boolean;
}) {
  if (isEditing) return initialTutorEnabled;
  return isExitTicket ? EXIT_TICKET_TUTOR_ENABLED_DEFAULT : initialTutorEnabled;
}

/**
 * How an exit ticket starts out in the gradebook. Editing keeps what the
 * assignment already has; otherwise an exit ticket opens as a feedback-only
 * check worth a few points if the teacher switches it to points.
 */
export function initialGradingFor({
  isEditing,
  isExitTicket,
  initialSubmitForGrade,
  initialPointValue,
  plannedGradebook = null,
  assignmentTypeContext = {},
}: {
  isEditing: boolean;
  isExitTicket: boolean;
  initialSubmitForGrade: boolean;
  initialPointValue: number | null | undefined;
  /** A planned ticket's own choice, which beats the exit ticket default. */
  plannedGradebook?: {
    submitForGrade: boolean;
    pointValue: number | null;
  } | null;
  assignmentTypeContext?: AssignmentTypeDefaultContext;
}) {
  if (isEditing || !isExitTicket) {
    return {
      submitForGrade: initialSubmitForGrade,
      pointValue: resolveNewAssignmentPointValue({
        isEditing,
        explicitPointValue: initialPointValue,
        assignmentType: assignmentTypeContext,
      }),
    };
  }
  if (plannedGradebook) {
    return {
      submitForGrade: plannedGradebook.submitForGrade,
      pointValue:
        plannedGradebook.pointValue ?? EXIT_TICKET_DEFAULT_POINT_VALUE,
    };
  }
  return {
    submitForGrade: EXIT_TICKET_SUBMIT_FOR_GRADE_DEFAULT,
    pointValue: EXIT_TICKET_DEFAULT_POINT_VALUE,
  };
}

export function AssignmentCreationSheet({
  ...props
}: AssignmentCreationSheetProps) {
  const createFetcher = useFetcher<CreateFetcherData>();
  const extractFetcher = useFetcher<ExtractFetcherData>();
  const navigate = useNavigate();
  const usage = useFreeAccountUsage();
  const [pickedTypeId, setPickedTypeId] = useState<string>();
  useEffect(() => {
    if (!props.open) setPickedTypeId(undefined);
  }, [props.open]);
  if (props.teachingLocked && !props.editingAssignment) {
    return null;
  }

  if (
    !props.teachingLocked &&
    usage &&
    props.assignmentTypes.some(
      (type) => !type.unavailableReason && !type.quotaExhausted
    ) &&
    !props.editingAssignment &&
    !props.fixedAssignmentTypeId &&
    !props.initialAssignmentTypeId &&
    !pickedTypeId
  ) {
    return (
      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent
          className="w-full sm:max-w-[480px]"
          overlayClassName="bg-black/35"
        >
          <SheetHeader>
            <SheetTitle>New Assignment</SheetTitle>
          </SheetHeader>
          <p className="mb-3 mt-6 text-sm font-medium">Assignment type</p>
          <div className="rounded-xl border bg-popover p-1 shadow-sm">
            {usage.assignments.map((row) => {
              const type = props.assignmentTypes.find(
                (type) => type.kind === row.kind
              );
              const selected =
                type?.id ===
                initialAssignmentTypeSelection(props.assignmentTypes);
              const usageMeta = freeAssignmentKindUsageMeta(usage, row);
              return (
                <button
                  type="button"
                  key={row.kind}
                  disabled={
                    !type ||
                    (!usage.unlimitedFreeAssignmentTiles &&
                      row.remaining === 0) ||
                    Boolean(type?.unavailableReason)
                  }
                  onClick={() => setPickedTypeId(type?.id)}
                  className={cn(
                    'flex min-h-[60px] w-full items-center gap-3 rounded-lg p-3 text-left text-sm disabled:text-muted-foreground',
                    selected && 'bg-secondary'
                  )}
                >
                  <AssignmentTypeTileImage
                    imageId={type?.imageId}
                    className="h-10 w-10 shrink-0 rounded-md"
                  />
                  <span className="w-4 shrink-0">
                    {selected && <Check size={14} />}
                  </span>
                  <span className="flex flex-1 flex-col gap-1">
                    <span>{row.label}</span>
                    {usageMeta ? (
                      <span
                        className={cn(
                          'text-xs text-muted-foreground',
                          row.remaining === 0 && 'text-amber-800'
                        )}
                      >
                        {usageMeta}
                      </span>
                    ) : null}
                  </span>
                  {!usage.unlimitedFreeAssignmentTiles &&
                    row.remaining === 0 && <Lock size={14} />}
                </button>
              );
            })}
            {(props.siteLicenseLockedAssignmentTiles ?? []).map((tile) => (
              <SiteLicenseLockedAssignmentTile
                key={tile.key}
                label={tile.label}
                variant="picker"
                imageId={tile.imageId}
              />
            ))}
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            {usage.unlimitedFreeAssignmentTiles
              ? 'Unlimited Class Starter, pre-writing, and thesis assignments.'
              : "Deleting an assignment doesn't give it back."}
          </p>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <AssignmentCreationSheetContent
      {...props}
      initialAssignmentTypeId={props.initialAssignmentTypeId ?? pickedTypeId}
      createFetcher={createFetcher}
      extractFetcher={extractFetcher}
      navigate={navigate}
    />
  );
}

export function AssignmentCreationSheetContent({
  open,
  onOpenChange,
  onCreated,
  entryPoint,
  assignmentTypes,
  libraryAssignmentTypes = [],
  teacherClasses,
  fixedAssignmentTypeId,
  initialAssignmentTypeId,
  fixedClassId,
  initialClassIds: initialClassIdsProp,
  assignToVariant = 'default',
  duplicateClasses,
  editingAssignment,
  initialTitle = '',
  initialPrompt = '',
  emptyClassesMessage = "You don't have any assignment-enabled classes yet.",
  titleRequired = false,
  initialSubmitForGrade = true,
  initialPointValue,
  initialTutorEnabled = true,
  initialCollaborationEnabled = false,
  initialCollaborationGroupMode = DEFAULT_COLLABORATION_GROUP_MODE,
  initialCollaborationGroupSize = null,
  initialGradingAssistantStrictnessLevel = DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  initialRubricTotalPoints = null,
  initialGradingMode = DEFAULT_ASSIGNMENT_GRADING_MODE,
  initialExitTicketMode = DEFAULT_EXIT_TICKET_MODE,
  initialExitTicketReflectionPrompt = null,
  initialExitTicketGrading = null,
  initialExitTicketGradebook = null,
  initialExitTicketFocus = EXIT_TICKET_FOCUS_OPTIONS[0].value,
  initialExitTicketAnswerType = null,
  initialExitTicketTopic = '',
  initialExitTicketLessonNotes = null,
  exitTicketBuilderV3Enabled = false,
  initialExitTicketConfig = null,
  initialPostAt,
  initialDueAt,
  createFetcher,
  extractFetcher,
  navigate = () => {},
  renderSheet = true,
}: AssignmentCreationSheetContentProps) {
  const classOptions = duplicateClasses ?? teacherClasses;
  const [createdSuccess, setCreatedSuccess] =
    useState<AssignmentCreatedSuccessState | null>(null);
  const [selectedAssignmentTypeId, setSelectedAssignmentTypeId] = useState(
    initialAssignmentTypeSelection(
      assignmentTypes,
      fixedAssignmentTypeId,
      initialAssignmentTypeId,
      Boolean(editingAssignment)
    )
  );
  const [selectedClassId, setSelectedClassId] = useState(
    fixedClassId ?? classOptions[0]?.id ?? ''
  );
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(
    initialClassIds(fixedClassId, initialClassIdsProp)
  );
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState(initialPrompt);
  const initialSelectedTypeId = initialAssignmentTypeSelection(
    assignmentTypes,
    fixedAssignmentTypeId,
    initialAssignmentTypeId,
    Boolean(editingAssignment)
  );
  const initialGrading = initialGradingFor({
    isEditing: Boolean(editingAssignment),
    isExitTicket: isExitTicketTypeId(assignmentTypes, initialSelectedTypeId),
    initialSubmitForGrade,
    initialPointValue,
    plannedGradebook: initialExitTicketGradebook,
    assignmentTypeContext: assignmentTypeContextFor(
      assignmentTypes,
      initialSelectedTypeId
    ),
  });
  const [submitForGrade, setSubmitForGrade] = useState(
    initialGrading.submitForGrade
  );
  const [pointValue, setPointValue] = useState(
    pointValueFieldValue(initialGrading.pointValue)
  );
  const [postAt, setPostAt] = useState<string>('');
  const [dueAt, setDueAt] = useState<string>('');
  const [grammarGradingEnabled, setGrammarGradingEnabled] = useState(true);
  const [tutorEnabled, setTutorEnabled] = useState(() =>
    initialTutorEnabledFor({
      isEditing: Boolean(editingAssignment),
      isExitTicket: isExitTicketTypeId(
        assignmentTypes,
        initialAssignmentTypeSelection(
          assignmentTypes,
          fixedAssignmentTypeId,
          initialAssignmentTypeId,
          Boolean(editingAssignment)
        )
      ),
      initialTutorEnabled,
    })
  );
  const [collaborationEnabled, setCollaborationEnabled] = useState(
    initialCollaborationEnabled
  );
  const [collaborationGroupMode, setCollaborationGroupMode] =
    useState<CollaborationGroupMode>(initialCollaborationGroupMode);
  const [collaborationGroupSize, setCollaborationGroupSize] = useState(
    initialCollaborationGroupSize ?? DEFAULT_COLLABORATION_GROUP_SIZE
  );
  const [saveForReuse, setSaveForReuse] = useState(false);
  const [gradingAssistantStrictnessLevel, setGradingAssistantStrictnessLevel] =
    useState<GradingAssistantStrictnessLevel>(
      initialGradingAssistantStrictnessLevel
    );
  const [gradingPanelOpen, setGradingPanelOpen] = useState(false);
  const [gradingMode, setGradingMode] =
    useState<AssignmentGradingMode>(initialGradingMode);
  const [exitTicketMode, setExitTicketMode] = useState<ExitTicketMode>(
    initialExitTicketMode
  );
  const [exitTicketFocus, setExitTicketFocus] = useState<ExitTicketFocus>(
    initialExitTicketFocus
  );
  const [exitTicketTopic, setExitTicketTopic] = useState(
    initialExitTicketTopic
  );
  // Empty until the teacher answers. There is no sensible default: guessing
  // either way decides for them whether a student can be told they are wrong.
  const [exitTicketAnswerType, setExitTicketAnswerType] = useState<string>(
    initialExitTicketAnswerType ?? ''
  );
  const [lessonNotesEnabled, setLessonNotesEnabled] = useState(
    initialLessonNotesEnabled(initialExitTicketLessonNotes)
  );
  // Opens itself when there is something in it worth seeing: notes the
  // planner already filled in, for one.
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(
    Boolean(initialExitTicketLessonNotes)
  );
  const [gradingDraft, setGradingDraft] = useState<ExitTicketGradingDraft>(
    gradingDraftFor(initialExitTicketGrading)
  );
  const [lessonNotes, setLessonNotes] = useState<ExitTicketLessonNotes>(
    initialExitTicketLessonNotes ?? EMPTY_LESSON_NOTES
  );
  const [reflectionPromptId, setReflectionPromptId] =
    useState<ExitTicketReflectionPromptId>(
      initialExitTicketReflectionPrompt?.id ??
        DEFAULT_EXIT_TICKET_REFLECTION_PROMPT
    );
  const [reflectionPromptText, setReflectionPromptText] = useState(
    initialExitTicketReflectionPrompt?.id === 'custom'
      ? initialExitTicketReflectionPrompt.text
      : ''
  );
  const v3DraftFromProps = () =>
    initialExitTicketV3Draft({
      config: initialExitTicketConfig,
      mode: initialExitTicketMode,
      reflectionPrompt: initialExitTicketReflectionPrompt,
      focus: initialExitTicketFocus,
      topic: initialExitTicketTopic,
      answerType: initialExitTicketAnswerType,
    });
  const [v3Draft, setV3Draft] = useState<ExitTicketV3Draft>(v3DraftFromProps);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [extractionTruncated, setExtractionTruncated] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const extractFileInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  const isEditing = Boolean(editingAssignment);
  const offeredLibraryTypes =
    isEditing || fixedAssignmentTypeId ? [] : libraryAssignmentTypes;
  const [removeAttachment, setRemoveAttachment] = useState(false);

  const CreateForm = createFetcher.Form;
  const isSaving = createFetcher.state !== 'idle';
  const isExtracting = extractFetcher.state !== 'idle';
  const requestedTypeId =
    fixedAssignmentTypeId ?? selectedAssignmentTypeId ?? '';
  const selectedType = assignmentTypes.find(
    (type) => type.id === requestedTypeId
  );
  const unchangedTypeEdit =
    isEditing &&
    requestedTypeId === (fixedAssignmentTypeId ?? initialAssignmentTypeId);
  const assignmentTypeId =
    !unchangedTypeEdit &&
    (!selectedType ||
      selectedType.unavailableReason ||
      selectedType.quotaExhausted)
      ? ''
      : requestedTypeId;
  const showGroupProjectToggle = assignmentBuilderV3ShowGroupProjectToggle({
    collaborationSupported: Boolean(selectedType?.collaborationSupported),
    isEdit: isEditing,
    editingCollaborationEnabled: isEditing
      ? initialCollaborationEnabled
      : false,
  });

  useEffect(() => {
    if (!isEditing && !selectedType?.collaborationSupported) {
      setCollaborationEnabled(false);
    }
  }, [assignmentTypeId, isEditing, selectedType?.collaborationSupported]);

  // Offered only where there is something to turn off. Switching it on cannot
  // invent a grammar category for a rubric that has none.
  const selectedTypeGradesGrammar = Boolean(
    assignmentTypes.find((type) => type.id === assignmentTypeId)?.gradesGrammar
  );
  // An exit ticket has no prompt box: the teacher answers the form and the
  // prompt is composed from the answers. With the feature off it falls back to
  // the ordinary prompt box, so an exit ticket type can exist before this does.
  const isExitTicket = isExitTicketAssignmentType(selectedType);
  const isQuickExitTicket = isExitTicket;
  // The v3 builder replaces the quick builder's form when its flag is on.
  const isV3ExitTicket = isExitTicket && exitTicketBuilderV3Enabled;
  const v3IsCheck =
    isV3ExitTicket && exitTicketActivityKind(v3Draft.activity) === 'check';
  // Bands, never steps, for the quick builder: the exit ticket rubric is one
  // category with four bands, and a short response is not stepped through.
  const effectiveGradingMode: AssignmentGradingMode = isQuickExitTicket
    ? 'bands'
    : gradingMode;
  const selectedExitTicketFocus = exitTicketFocusOption(exitTicketFocus);
  // Composed through the same parser the server uses, so the preview a teacher
  // approves and the prompt their students get cannot drift apart. Empty means
  // the form is not answered yet, which is also what blocks submission.
  // The quick builder's own answers. The original builder posts none of
  // these, so it composes exactly what it always did.
  // Lesson notes post when the grading section asks for them as criteria, or
  // when the notes are switched on; the gate reads exactly what will post.
  // In v3 a check asks for key points in the builder itself, so the notes
  // section does not ask for them twice.
  const criteriaNoteKeys: (keyof ExitTicketLessonNotes)[] = isV3ExitTicket
    ? v3IsCheck
      ? ['mustMention']
      : []
    : exitTicketCriteriaNoteKeys({
        kind: exitTicketKindForMode(exitTicketMode),
        graded: submitForGrade,
        answerType: exitTicketAnswerType,
        basis: gradingDraft.basis,
      });
  const postedNote = (key: keyof ExitTicketLessonNotes) =>
    lessonNotesEnabled || criteriaNoteKeys.includes(key)
      ? lessonNotes[key]
      : undefined;
  const quickBuilderInput = {
    reflectionPrompt: reflectionPromptId,
    reflectionPromptText,
    graded: submitForGrade,
    gradingBasis: gradingDraft.basis,
    minWords: gradingDraft.minWords,
    minSentences: gradingDraft.minSentences,
    assessFor: gradingDraft.assessFor,
    lessonMainPoints: postedNote('mainPoints'),
    lessonMustMention: postedNote('mustMention'),
    lessonWatchFor: postedNote('watchFor'),
  };
  const v3Input = {
    activity: v3Draft.activity,
    promptText: v3Draft.promptText,
    starter: v3Draft.starter,
    graded: submitForGrade,
    gradingBasis: gradingDraft.basis,
    lessonMainPoints: postedNote('mainPoints'),
    lessonMustMention: postedNote('mustMention'),
    lessonWatchFor: postedNote('watchFor'),
  };
  const v3Config = parseExitTicketConfigInput(v3Input);
  const v3Prompt = v3Config.success
    ? composeExitTicketPrompt(v3Config.config)
    : '';
  const quickExitTicketConfig = parseExitTicketConfigInput({
    mode: exitTicketMode,
    focus: exitTicketFocus,
    topic: exitTicketTopic,
    answerType: exitTicketAnswerType,
    ...quickBuilderInput,
  });
  // The desired-response answer never reaches the student, so the preview is
  // composed without waiting on it — but the real config above is what gates
  // submission, so the ticket still cannot be created unanswered.
  const exitTicketPreviewConfig = parseExitTicketConfigInput({
    mode: exitTicketMode,
    focus: exitTicketFocus,
    topic: exitTicketTopic,
    answerType: exitTicketAnswerType || EXIT_TICKET_ANSWER_TYPES[0],
    ...quickBuilderInput,
  });
  const quickExitTicketPreview = exitTicketPreviewConfig.success
    ? composeExitTicketPrompt(exitTicketPreviewConfig.config)
    : '';
  const quickExitTicketPrompt = quickExitTicketConfig.success
    ? composeExitTicketPrompt(quickExitTicketConfig.config)
    : '';
  // Empty means the form is not answered yet, which also blocks submission.
  const exitTicketPrompt = isV3ExitTicket ? v3Prompt : quickExitTicketPrompt;
  const selectedAssignmentType = assignmentTypes.find(
    (type) => type.id === assignmentTypeId
  );
  const usesDailyPagesEngagementRubric =
    assignmentTypeUsesDailyPagesEngagementRubric({
      kind: selectedAssignmentType?.kind,
      rubricName: selectedAssignmentType?.rubricName,
    });
  const minimumPointValue = usesDailyPagesEngagementRubric
    ? MIN_DAILY_PAGES_ENGAGEMENT_POINT_TOTAL
    : 1;
  const engagementBandPreview = useMemo(() => {
    if (!usesDailyPagesEngagementRubric || !gradingPanelOpen) return null;
    const parsed = Number.parseInt(pointValue, 10);
    if (!Number.isSafeInteger(parsed) || parsed < minimumPointValue) {
      return null;
    }
    try {
      return dailyPagesEngagementTierBands(parsed);
    } catch {
      return null;
    }
  }, [
    gradingPanelOpen,
    minimumPointValue,
    pointValue,
    usesDailyPagesEngagementRubric,
  ]);
  const hasFixedClass = Boolean(fixedClassId);
  const isDuplicateSheet = assignToVariant === 'duplicate';
  // Every creation entry point uses the same server workflow. In particular,
  // the class page must not silently drop collaboration fields by posting to
  // its older local action. Editing stays on the owning route.
  const usesBulkCreateApi = !isEditing;
  const formAction = usesBulkCreateApi ? '/api/assignments/create' : undefined;
  const selectedClassCount = hasFixedClass
    ? 1
    : usesBulkCreateApi
      ? selectedClassIds.length
      : selectedClassId
        ? 1
        : 0;
  const pdfExtractionClassId = hasFixedClass
    ? fixedClassId
    : usesBulkCreateApi
      ? selectedClassIds.length === 1
        ? selectedClassIds[0]
        : ''
      : selectedClassId;

  const formError = useMemo(() => {
    if (!createFetcher.data || createFetcher.data.success) return '';
    return createFetcher.data.message || 'Unable to create assignment.';
  }, [createFetcher.data]);

  const extractError = useMemo(() => {
    if (!extractFetcher.data || extractFetcher.data.success) return '';
    return extractFetcher.data.message || 'Unable to extract PDF content.';
  }, [extractFetcher.data]);

  // The resting summary is the only part of the grading block most teachers
  // ever read, so it names the settings actually in force rather than the
  // defaults, and the panel spells out whichever option is currently chosen.
  const selectedStrictness = gradingAssistantStrictnessOptions.find(
    (option) => option.value === gradingAssistantStrictnessLevel
  );
  const strictnessLabel = selectedStrictness?.label ?? '';
  const strictnessDescription = selectedStrictness?.description ?? '';

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    setSelectedAssignmentTypeId(
      initialAssignmentTypeSelection(
        assignmentTypes,
        fixedAssignmentTypeId,
        initialAssignmentTypeId,
        Boolean(editingAssignment)
      )
    );
    setSelectedClassId(fixedClassId ?? teacherClasses[0]?.id ?? '');
    setSelectedClassIds(initialClassIds(fixedClassId, initialClassIdsProp));
    setCreatedSuccess(null);
    setTitle(initialTitle);
    setPrompt(initialPrompt);
    const resetTypeId = initialAssignmentTypeSelection(
      assignmentTypes,
      fixedAssignmentTypeId,
      initialAssignmentTypeId,
      Boolean(editingAssignment)
    );
    const grading = initialGradingFor({
      isEditing: Boolean(editingAssignment),
      isExitTicket: isExitTicketTypeId(assignmentTypes, resetTypeId),
      initialSubmitForGrade,
      initialPointValue,
      plannedGradebook: initialExitTicketGradebook,
      assignmentTypeContext: assignmentTypeContextFor(
        assignmentTypes,
        resetTypeId
      ),
    });
    setSubmitForGrade(grading.submitForGrade);
    setPointValue(pointValueFieldValue(grading.pointValue));
    setPostAt(toDateInputValue(initialPostAt));
    setDueAt(toDateInputValue(initialDueAt));
    setTutorEnabled(
      initialTutorEnabledFor({
        isEditing: Boolean(editingAssignment),
        isExitTicket: isExitTicketTypeId(
          assignmentTypes,
          initialAssignmentTypeSelection(
            assignmentTypes,
            fixedAssignmentTypeId,
            initialAssignmentTypeId,
            Boolean(editingAssignment)
          )
        ),
        initialTutorEnabled,
      })
    );
    setCollaborationEnabled(initialCollaborationEnabled);
    setCollaborationGroupMode(initialCollaborationGroupMode);
    setCollaborationGroupSize(
      initialCollaborationGroupSize ?? DEFAULT_COLLABORATION_GROUP_SIZE
    );
    setSaveForReuse(false);
    setGradingAssistantStrictnessLevel(initialGradingAssistantStrictnessLevel);
    setGradingPanelOpen(false);
    setGradingMode(initialGradingMode);
    setExitTicketMode(initialExitTicketMode);
    setExitTicketFocus(initialExitTicketFocus);
    setExitTicketTopic(initialExitTicketTopic);
    setExitTicketAnswerType(initialExitTicketAnswerType ?? '');
    setLessonNotesEnabled(
      initialLessonNotesEnabled(initialExitTicketLessonNotes)
    );
    setGradingDraft(gradingDraftFor(initialExitTicketGrading));
    setMoreOptionsOpen(Boolean(initialExitTicketLessonNotes));
    setLessonNotes(initialExitTicketLessonNotes ?? EMPTY_LESSON_NOTES);
    setReflectionPromptId(
      initialExitTicketReflectionPrompt?.id ??
        DEFAULT_EXIT_TICKET_REFLECTION_PROMPT
    );
    setReflectionPromptText(
      initialExitTicketReflectionPrompt?.id === 'custom'
        ? initialExitTicketReflectionPrompt.text
        : ''
    );
    setV3Draft(v3DraftFromProps());
    setAttachmentFile(null);
    setRemoveAttachment(false);
    setExtractionTruncated(false);
    if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    if (extractFileInputRef.current) extractFileInputRef.current.value = '';
  }, [
    assignmentTypes,
    fixedAssignmentTypeId,
    initialAssignmentTypeId,
    fixedClassId,
    initialClassIdsProp,
    initialPrompt,
    initialTitle,
    initialSubmitForGrade,
    initialPointValue,
    initialTutorEnabled,
    initialCollaborationEnabled,
    initialCollaborationGroupMode,
    initialCollaborationGroupSize,
    initialGradingAssistantStrictnessLevel,
    initialGradingMode,
    initialExitTicketMode,
    initialExitTicketFocus,
    initialExitTicketTopic,
    initialExitTicketAnswerType,
    initialExitTicketLessonNotes,
    initialExitTicketReflectionPrompt,
    initialExitTicketGrading,
    initialExitTicketGradebook,
    initialExitTicketConfig,
    editingAssignment,
    initialPostAt,
    initialDueAt,
    open,
    teacherClasses,
    initialClassIdsProp,
  ]);

  const toldCreated = useRef<unknown>(null);
  useEffect(() => {
    if (createFetcher.state !== 'idle' || !createFetcher.data?.success) return;
    if (editingAssignment) {
      onOpenChange(false);
      return;
    }
    if (toldCreated.current === createFetcher.data) return;
    toldCreated.current = createFetcher.data;
    onCreated?.({ nextStep: Boolean(createFetcher.data.nextStep) });

    const assignmentId = createFetcher.data.assignmentId;
    if (!assignmentId) {
      onOpenChange(false);
      const nextStep = createFetcher.data.nextStep;
      if (nextStep) navigate(nextStep.url);
      return;
    }

    const selectedType = assignmentTypes.find((t) => t.id === assignmentTypeId);
    const classLabels = (hasFixedClass && fixedClassId
      ? classOptions.filter((c) => c.id === fixedClassId)
      : classOptions.filter((c) => selectedClassIds.includes(c.id))
    ).map((c) => assignmentCreationClassLabel(c));

    setCreatedSuccess({
      assignmentId,
      title:
        title.trim() || initialTitle.trim() || 'Untitled Assignment',
      assignmentTypeTitle: selectedType?.title ?? 'Assignment',
      classLabels,
      collaborationEnabled,
      nextStep: createFetcher.data.nextStep ?? null,
      saveForReuseWarning: createFetcher.data.message?.includes(
        'could not be saved for reuse'
      ),
    });
  }, [
    assignmentTypes,
    assignmentTypeId,
    classOptions,
    collaborationEnabled,
    createFetcher.data,
    createFetcher.state,
    editingAssignment,
    fixedClassId,
    hasFixedClass,
    navigate,
    onCreated,
    onOpenChange,
    initialTitle,
    selectedClassIds,
    title,
  ]);

  useEffect(() => {
    if (!extractFetcher.data?.success) return;

    if (typeof extractFetcher.data.title === 'string') {
      setTitle(extractFetcher.data.title);
    }
    if (typeof extractFetcher.data.prompt === 'string') {
      setPrompt(extractFetcher.data.prompt);
    }
    setExtractionTruncated(Boolean(extractFetcher.data.truncated));
  }, [extractFetcher.data]);

  function toggleClass(classId: string) {
    if (hasFixedClass) return;
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  }

  function handleExtractPdf(file: File) {
    if (!pdfExtractionClassId) return;
    setExtractionTruncated(false);
    const formData = new FormData();
    formData.append('classId', pdfExtractionClassId);
    formData.append('file', file);
    extractFetcher.submit?.(formData, {
      method: 'POST',
      action: '/api/domain/assignment-pdf-extract',
      encType: 'multipart/form-data',
    });
  }

  const isSubmitDisabled =
    isSaving ||
    isExtracting ||
    !assignmentTypeId ||
    (!unchangedTypeEdit &&
      (!selectedType ||
        Boolean(selectedType.unavailableReason) ||
        Boolean(selectedType.quotaExhausted))) ||
    (!isEditing && selectedClassCount === 0) ||
    (isExitTicket ? !exitTicketPrompt : !prompt.trim()) ||
    (titleRequired && !title.trim()) ||
    (submitForGrade && !pointValue.trim());

  const headingText = isEditing ? 'Edit Assignment' : 'New Assignment';
  const headingDescription = isEditing
    ? 'Update this assignment. Students keep the documents they have already started.'
    : 'Create an assignment for one or more of your classes.';

  const header = renderSheet ? (
    <SheetHeader>
      <SheetTitle>{headingText}</SheetTitle>
      <SheetDescription>{headingDescription}</SheetDescription>
    </SheetHeader>
  ) : (
    <div>
      <h2>{headingText}</h2>
      <p>{headingDescription}</p>
    </div>
  );

  // Teacher-only context about the lesson. Rendered only while switched on,
  // so a ticket without notes posts no note fields and stores none. Nothing
  // here is ever composed into the prompt.
  const exitTicketLessonNotesBlock = (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="flex items-start gap-2.5">
        <Checkbox
          id="assignment-create-exit-ticket-lesson-notes"
          checked={lessonNotesEnabled}
          onCheckedChange={(checked) => setLessonNotesEnabled(checked === true)}
          disabled={isSaving}
          className="mt-0.5 size-4 shrink-0"
        />
        <Label
          htmlFor="assignment-create-exit-ticket-lesson-notes"
          className="cursor-pointer font-normal"
        >
          <span className="font-medium">Add notes about the lesson</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            Students never see these. The more you tell us here, the more
            targeted this exit ticket becomes — responses can be read against
            what you actually taught, instead of just on their own terms.
          </span>
        </Label>
      </div>

      {lessonNotesEnabled ? (
        <div className="space-y-3 pl-[calc(1rem+0.625rem)]">
          {EXIT_TICKET_LESSON_NOTE_FIELDS.map((field) => {
            const id = `assignment-create-exit-ticket-lesson-${field.key}`;
            const name = `exitTicketLesson${field.key[0].toUpperCase()}${field.key.slice(1)}`;
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={id}>
                  {field.label}{' '}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id={id}
                  name={name}
                  value={lessonNotes[field.key]}
                  onChange={(event) =>
                    setLessonNotes((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  rows={2}
                  maxLength={EXIT_TICKET_LESSON_NOTE_MAX_LENGTH}
                  placeholder={field.placeholder}
                  disabled={isSaving}
                />
                <p className="text-xs text-muted-foreground">
                  {field.helperText}
                </p>
              </div>
            );
          })}
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {exitTicketTargetingHint(lessonNotes)}
          </p>
        </div>
      ) : null}
    </div>
  );

  // The composed prompt goes along so any handler that still expects a
  // prompt field keeps working. The server recomposes it from the answers
  // rather than trusting this value.
  const exitTicketHiddenFields = isV3ExitTicket ? (
    // The v3 builder posts its own fields; the composed prompt still goes
    // along for any handler that expects one, and is recomposed server-side.
    <input type="hidden" name="prompt" value={exitTicketPrompt} />
  ) : (
    <>
      <input type="hidden" name="exitTicketMode" value={exitTicketMode} />
      {exitTicketMode === 'specific' ? (
        <>
          <input type="hidden" name="exitTicketFocus" value={exitTicketFocus} />
          <input type="hidden" name="exitTicketTopic" value={exitTicketTopic} />
          <input
            type="hidden"
            name="exitTicketAnswerType"
            value={exitTicketAnswerType}
          />
        </>
      ) : null}
      <input type="hidden" name="prompt" value={exitTicketPrompt} />
    </>
  );

  const form = (
    <>
      {header}

      <CreateForm
        method="post"
        action={formAction}
        encType="multipart/form-data"
        className="mt-6 space-y-4"
        onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
          if (isSubmitDisabled) event.preventDefault();
        }}
      >
        <input
          type="hidden"
          name="intent"
          value={isEditing ? 'update-assignment' : 'create-assignment'}
        />
        <input type="hidden" name="assignmentTypeId" value={assignmentTypeId} />

        {editingAssignment ? (
          <input
            type="hidden"
            name="assignmentId"
            value={editingAssignment.id}
          />
        ) : hasFixedClass ? (
          <input
            type="hidden"
            name={usesBulkCreateApi ? 'classIds' : 'classId'}
            value={fixedClassId}
          />
        ) : (
          selectedClassIds.map((id) => (
            <input key={id} type="hidden" name="classIds" value={id} />
          ))
        )}

        <div className="space-y-2">
          <Label htmlFor="assignment-create-type">Assignment type</Label>
          <AssignmentTypeSearchSelect
            id="assignment-create-type"
            assignmentTypes={assignmentTypes}
            value={assignmentTypeId}
            disabled={
              isSaving ||
              Boolean(fixedAssignmentTypeId) ||
              Boolean(editingAssignment?.assignmentTypeLocked)
            }
            onValueChange={(nextTypeId) => {
              const libraryType = offeredLibraryTypes.find(
                (type) => type.id === nextTypeId
              );
              if (libraryType) {
                // Built from its own library, not this form: leave the form's
                // type alone and send the teacher to the library.
                onOpenChange(false);
                navigate(libraryType.href);
                return;
              }
              setSelectedAssignmentTypeId(nextTypeId);
              const nextIsExitTicket = isExitTicketTypeId(
                assignmentTypes,
                nextTypeId
              );
              setTutorEnabled(
                initialTutorEnabledFor({
                  isEditing,
                  isExitTicket: nextIsExitTicket,
                  initialTutorEnabled,
                })
              );
              const grading = initialGradingFor({
                isEditing,
                isExitTicket: nextIsExitTicket,
                initialSubmitForGrade,
                initialPointValue: undefined,
                assignmentTypeContext: assignmentTypeContextFor(
                  assignmentTypes,
                  nextTypeId
                ),
              });
              setSubmitForGrade(grading.submitForGrade);
              setPointValue(pointValueFieldValue(grading.pointValue));
            }}
          />
          {!isEditing &&
          !assignmentTypes.some(
            (type) => !type.unavailableReason && !type.quotaExhausted
          ) ? (
            <p role="status" className="text-sm text-muted-foreground">
              No assignment types are available for this classroom. Included
              types may be unavailable or their free allowance has been used.
              Contact your administrator for help.
            </p>
          ) : null}
          {editingAssignment?.assignmentTypeLocked ? (
            <p className="text-xs text-muted-foreground">
              Assignment type is fixed because shared group drafts already
              exist.
            </p>
          ) : null}
        </div>

        <div className={isEditing ? 'hidden' : 'space-y-2'}>
          <Label>Assign to</Label>
          {isDuplicateSheet ? (
            <>
              <p
                className="text-sm font-medium text-foreground"
                data-testid="duplicate-class-selection-count"
              >
                {selectedClassIds.length} of {classOptions.length} selected
              </p>
              <div
                className="max-h-[17.5rem] space-y-0 overflow-y-auto rounded-md border"
                data-testid="duplicate-class-list"
              >
                {classOptions.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    {emptyClassesMessage}
                  </p>
                ) : (
                  classOptions.map((klass) => {
                    const checked = hasFixedClass
                      ? klass.id === fixedClassId
                      : selectedClassIds.includes(klass.id);
                    return (
                      <div
                        key={klass.id}
                        className="flex items-start gap-2.5 border-b border-border px-3 py-3 last:border-b-0"
                      >
                        <Checkbox
                          id={`assignment-create-class-${klass.id}`}
                          checked={checked}
                          onCheckedChange={() => toggleClass(klass.id)}
                          disabled={isSaving || hasFixedClass}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={`assignment-create-class-${klass.id}`}
                          className="cursor-pointer font-normal leading-snug"
                        >
                          <span className="block">
                            {assignmentCreationClassLabel(klass)}
                          </span>
                          {typeof klass.studentCount === 'number' ? (
                            <span className="block text-sm text-muted-foreground">
                              {klass.studentCount}{' '}
                              {klass.studentCount === 1 ? 'student' : 'students'}
                            </span>
                          ) : null}
                        </Label>
                      </div>
                    );
                  })
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Pick one or more classes. Each gets its own copy with the same
                prompt and settings.
              </p>
            </>
          ) : (
            <div className="space-y-2.5 rounded-md border p-3">
              {classOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {emptyClassesMessage}
                </p>
              ) : (
                classOptions.map((klass) => {
                  const checked = hasFixedClass
                    ? klass.id === fixedClassId
                    : selectedClassIds.includes(klass.id);

                  return (
                    <div key={klass.id} className="flex items-center gap-2.5">
                      <Checkbox
                        id={`assignment-create-class-${klass.id}`}
                        checked={checked}
                        onCheckedChange={() => toggleClass(klass.id)}
                        disabled={isSaving || hasFixedClass}
                      />
                      <Label
                        htmlFor={`assignment-create-class-${klass.id}`}
                        className="cursor-pointer font-normal"
                      >
                        {assignmentCreationClassLabel(klass)}
                      </Label>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="assignment-create-title">
            {titleRequired ? 'Title' : 'Title (optional)'}
          </Label>
          <Input
            id="assignment-create-title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g., Rhetorical Analysis Essay"
            disabled={isSaving}
            required={titleRequired}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="assignment-create-post-at">
              Post date{' '}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="assignment-create-post-at"
              name="postAt"
              type="date"
              value={postAt}
              onChange={(event) => setPostAt(event.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignment-create-due-at">
              Due date <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="assignment-create-due-at"
              name="dueAt"
              type="date"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              disabled={isSaving}
            />
          </div>
        </div>

        {isV3ExitTicket ? (
          // v3 exit tickets take no file. One already attached is still
          // shown, so it can be removed rather than stranded.
          editingAssignment?.promptAttachmentName ? (
            <div className="space-y-2">
              {removeAttachment ? (
                <input
                  type="hidden"
                  name="removePromptAttachment"
                  value="true"
                />
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <span className="truncate">
                    {editingAssignment.promptAttachmentName}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setRemoveAttachment(true)}
                    disabled={isSaving}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ) : null
        ) : (
          <div className="space-y-2">
            <Label htmlFor="assignment-create-attachment">
              Attachment (optional)
            </Label>
            <p className="text-sm text-muted-foreground">
              Any documents uploaded here will be attached to the prompt and
              available to be viewed by students as they&apos;re working on
              their document.
            </p>
            {editingAssignment?.promptAttachmentName && !removeAttachment ? (
              <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <span className="truncate">
                  {editingAssignment.promptAttachmentName}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setRemoveAttachment(true)}
                  disabled={isSaving}
                >
                  Remove
                </Button>
              </div>
            ) : null}
            {removeAttachment ? (
              <input type="hidden" name="removePromptAttachment" value="true" />
            ) : null}
            <Input
              id="assignment-create-attachment"
              ref={attachmentInputRef}
              name="promptAttachment"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                setAttachmentFile(event.target.files?.[0] ?? null);
              }}
              disabled={isSaving}
            />
            {attachmentFile ? (
              <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <span className="truncate">{attachmentFile.name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAttachmentFile(null);
                    if (attachmentInputRef.current) {
                      attachmentInputRef.current.value = '';
                    }
                  }}
                  disabled={isSaving}
                >
                  Remove
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {isV3ExitTicket ? (
          <div className="space-y-4">
            <ExitTicketBuilderV3
              activity={v3Draft.activity}
              onActivityChange={(activity) =>
                setV3Draft((current) =>
                  current.activity === activity
                    ? current
                    : activity === 'reflect'
                      ? {
                          activity,
                          promptText:
                            exitTicketStarterOption('learned')!.prompt,
                          starter: 'learned',
                        }
                      : // A check's question is the teacher's to write; a
                        // reflection starter would read as the wrong kind.
                        {
                          activity,
                          promptText:
                            current.activity === 'reflect'
                              ? ''
                              : current.promptText,
                          starter: null,
                        }
                )
              }
              promptText={v3Draft.promptText}
              onPromptTextChange={(promptText) =>
                setV3Draft((current) => ({ ...current, promptText }))
              }
              starter={v3Draft.starter}
              onStarterChange={(starter) =>
                setV3Draft({
                  activity: 'reflect',
                  promptText: exitTicketStarterOption(starter)!.prompt,
                  starter,
                })
              }
              keyPoints={lessonNotes.mustMention}
              onKeyPointsChange={(value) =>
                setLessonNotes((current) => ({
                  ...current,
                  mustMention: value,
                }))
              }
              graded={submitForGrade}
              onGradedChange={setSubmitForGrade}
              pointValue={pointValue}
              onPointValueChange={setPointValue}
              gradingBasis={gradingDraft.basis}
              onGradingBasisChange={(basis) =>
                setGradingDraft((current) => ({ ...current, basis }))
              }
              preview={v3Prompt}
              disabled={isSaving}
            />
            {exitTicketHiddenFields}
          </div>
        ) : isExitTicket ? (
          <div className="space-y-4">
            <ExitTicketBuilder
              mode={exitTicketMode}
              onModeChange={setExitTicketMode}
              focus={exitTicketFocus}
              onFocusChange={setExitTicketFocus}
              topic={exitTicketTopic}
              onTopicChange={setExitTicketTopic}
              answerType={exitTicketAnswerType}
              onAnswerTypeChange={setExitTicketAnswerType}
              reflectionPromptId={reflectionPromptId}
              onReflectionPromptIdChange={setReflectionPromptId}
              reflectionPromptText={reflectionPromptText}
              onReflectionPromptTextChange={setReflectionPromptText}
              graded={submitForGrade}
              onGradedChange={setSubmitForGrade}
              pointValue={pointValue}
              onPointValueChange={setPointValue}
              grading={gradingDraft}
              onGradingChange={(patch) =>
                setGradingDraft((current) => ({ ...current, ...patch }))
              }
              lessonNotes={lessonNotes}
              onLessonNoteChange={(key, value) =>
                setLessonNotes((current) => ({ ...current, [key]: value }))
              }
              preview={quickExitTicketPreview}
              disabled={isSaving}
            />
            {exitTicketHiddenFields}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="assignment-create-prompt">Prompt</Label>
            <div className="relative">
              <Textarea
                id="assignment-create-prompt"
                name="prompt"
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  setExtractionTruncated(false);
                }}
                rows={10}
                className="pb-12"
                placeholder="Type the full assignment prompt for students, or extract it from a PDF..."
                disabled={isSaving}
                required
              />
              <input
                ref={extractFileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = '';
                  if (file) handleExtractPdf(file);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label="Extract assignment text from PDF"
                className="absolute bottom-2 right-2 shadow-sm"
                onClick={() => extractFileInputRef.current?.click()}
                disabled={!pdfExtractionClassId || isExtracting || isSaving}
              >
                {isExtracting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Extracting...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <FileUp className="h-3.5 w-3.5" />
                    Extract from PDF
                  </span>
                )}
              </Button>
            </div>
            {extractError ? (
              <p className="text-sm text-destructive">{extractError}</p>
            ) : null}
            {extractionTruncated ? (
              <p className="text-sm text-destructive">
                This PDF was too big — the extracted prompt got cut off. Please
                review it and fill in the rest manually.
              </p>
            ) : null}
          </div>
        )}

        <div className="pt-6">
          {isQuickExitTicket ? null : isExitTicket ? (
            /* Same field, same values — this only reframes the choice in the
               terms an exit ticket is actually about. Feedback only still
               reads and scores every response; it just keeps the score out of
               the gradebook. */
            <div className="space-y-2">
              <Label>How this is graded</Label>
              <RadioGroup
                value={submitForGrade ? 'points' : 'feedback'}
                onValueChange={(value) => setSubmitForGrade(value === 'points')}
                disabled={isSaving}
                className="gap-3 pt-1"
              >
                <div className="flex items-start gap-2.5">
                  <RadioGroupItem
                    id="assignment-create-exit-ticket-feedback-only"
                    value="feedback"
                    className="mt-1"
                  />
                  <Label
                    htmlFor="assignment-create-exit-ticket-feedback-only"
                    className="cursor-pointer font-normal"
                  >
                    <span className="font-medium">
                      Feedback and understanding only
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      Every response is still read and given feedback, and you
                      still see who understood it. Nothing goes in the
                      gradebook. Students answer honestly because there is
                      nothing to lose by admitting what they missed.
                    </span>
                  </Label>
                </div>
                <div className="flex items-start gap-2.5">
                  <RadioGroupItem
                    id="assignment-create-exit-ticket-for-points"
                    value="points"
                    className="mt-1"
                  />
                  <Label
                    htmlFor="assignment-create-exit-ticket-for-points"
                    className="cursor-pointer font-normal"
                  >
                    <span className="font-medium">For points</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      A recorded grade. Worth doing when you want the ticket to
                      count toward completion — keep it small so one lesson
                      check never outweighs real work.
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="assignment-create-submit-for-grade"
                  checked={submitForGrade}
                  onCheckedChange={(checked) =>
                    setSubmitForGrade(checked === true)
                  }
                  disabled={isSaving}
                  className="size-4 shrink-0"
                />
                <Label
                  htmlFor="assignment-create-submit-for-grade"
                  className="cursor-pointer font-normal leading-none"
                >
                  Submit for grade
                </Label>
              </div>
              <p className="mt-1 pl-[calc(1rem+0.625rem)] text-sm text-muted-foreground">
                Students can submit this assignment for a recorded grade.
              </p>
            </>
          )}

          {submitForGrade ? (
            <div className="mt-3 overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Graded out of{' '}
                  <span className="font-medium text-foreground">
                    {pointValue || '—'} points
                  </span>
                  , read at the{' '}
                  <span className="font-medium text-foreground">
                    {strictnessLabel.toLowerCase()}
                  </span>{' '}
                  level.
                </p>
                <Button
                  id="assignment-create-change-grading"
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  aria-expanded={gradingPanelOpen}
                  aria-controls="assignment-create-grading-panel"
                  onClick={() => setGradingPanelOpen((open) => !open)}
                  disabled={isSaving}
                >
                  {gradingPanelOpen ? 'Done' : 'Change'}
                </Button>
              </div>

              {gradingPanelOpen ? (
                <div
                  id="assignment-create-grading-panel"
                  className="space-y-5 border-t border-border px-4 py-4"
                >
                  {isQuickExitTicket ? null : (
                    <div className="space-y-2">
                      <Label htmlFor="assignment-create-point-value">
                        Point value
                      </Label>
                      <div className="flex items-center gap-2">
                        {/* `Input` is `w-full`, so the width lives on a wrapper. */}
                        <div className="w-24">
                          <Input
                            id="assignment-create-point-value"
                            name="pointValue"
                            type="number"
                            min={minimumPointValue}
                            max={1000}
                            step={1}
                            inputMode="numeric"
                            value={pointValue}
                            onChange={(event) =>
                              setPointValue(event.target.value)
                            }
                            disabled={isSaving}
                            required
                            className="tabular-nums"
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">
                          points
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        What the assignment is worth in the gradebook.
                        {minimumPointValue > 1
                          ? ` Daily Pages engagement assignments need at least ${minimumPointValue} points when graded.`
                          : ' The rubric keeps its own scale either way.'}
                      </p>
                    </div>
                  )}

                  {engagementBandPreview ? (
                    <div
                      className="space-y-2"
                      data-testid="assignment-create-engagement-bands"
                    >
                      <p className="text-sm font-medium">Engagement tiers</p>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {engagementBandPreview.map((band) => (
                          <li key={band.tier}>
                            <span className="font-medium text-foreground">
                              {band.label}
                            </span>
                            {' — '}
                            {formatDailyPagesEngagementBandRange(band)} points
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Scoring behavior is now fixed to bands; UI selector removed */}

                  <div className="space-y-2">
                    <p
                      id="assignment-create-grading-assistance"
                      className="text-sm font-medium"
                    >
                      Grading assistance
                    </p>
                    <GradingChoiceGroup
                      labelId="assignment-create-grading-assistance"
                      value={gradingAssistantStrictnessLevel}
                      options={gradingAssistantStrictnessOptions}
                      onChange={setGradingAssistantStrictnessLevel}
                      disabled={isSaving}
                    />
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {strictnessLabel}
                      </span>{' '}
                      — {strictnessDescription}
                    </p>
                  </div>
                </div>
              ) : isQuickExitTicket ? null : (
                <input type="hidden" name="pointValue" value={pointValue} />
              )}

              {/* `rubricTotalPoints` rescales the rubric itself and the
                  `max_score` handed to the grading assistant, which is a
                  different thing from the gradebook total above. Nothing in
                  this sheet sets one; an assignment that already has an
                  override keeps it. */}
              <input
                type="hidden"
                name="rubricTotalPoints"
                value={pointValueFieldValue(initialRubricTotalPoints)}
              />
              <input type="hidden" name="gradingMode" value="bands" />
              <input
                type="hidden"
                name="gradingAssistantStrictnessLevel"
                value={gradingAssistantStrictnessLevel}
              />
            </div>
          ) : null}
          <BooleanFormValue name="submitForGrade" value={submitForGrade} />
        </div>

        {/* The quick builder keeps a default exit ticket to one screen:
            everything a teacher rarely changes waits in here, still posting
            its value, until they open it. */}
        <MoreOptions
          enabled={isQuickExitTicket}
          open={moreOptionsOpen}
          onOpenChange={setMoreOptionsOpen}
        >
          {isQuickExitTicket ? (
            <div className="pt-4">
              <ExitTicketLessonNotesSection
                criteriaKeys={criteriaNoteKeys}
                lessonNotes={lessonNotes}
                onLessonNoteChange={(key, value) =>
                  setLessonNotes((current) => ({ ...current, [key]: value }))
                }
                enabled={lessonNotesEnabled}
                onEnabledChange={setLessonNotesEnabled}
                disabled={isSaving}
              />
            </div>
          ) : null}
          {/* Frozen once the assignment exists: students may already have
            documents and tutor sessions built around this setting, so it is
            shown read-only rather than hidden. Nothing named tutorEnabled is
            submitted while editing, which is what tells the server to leave
            the stored value alone. */}
          <div className="pt-6">
            {isEditing ? null : (
              <BooleanFormValue name="tutorEnabled" value={tutorEnabled} />
            )}
            <div className="flex items-center gap-2.5">
              <Checkbox
                id="assignment-create-tutor-enabled"
                checked={tutorEnabled}
                onCheckedChange={(checked) => setTutorEnabled(checked === true)}
                disabled={isSaving || isEditing}
                className="size-4 shrink-0"
              />
              <Label
                htmlFor="assignment-create-tutor-enabled"
                className={
                  isEditing
                    ? 'font-normal leading-none text-muted-foreground'
                    : 'cursor-pointer font-normal leading-none'
                }
              >
                Tutor enabled
              </Label>
              {tutorEnabled ? null : (
                <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Cold write
                </span>
              )}
            </div>
            <p className="mt-1 pl-[calc(1rem+0.625rem)] text-sm text-muted-foreground">
              {isEditing
                ? 'The tutor cannot be switched on or off after an assignment is created — students may already be working with it. Duplicate the assignment to give a class a version with the other setting.'
                : isV3ExitTicket
                  ? 'It starts off, because an exit ticket shows what students understand on their own. Turn it on for a class that tends to hand in six words. It will ask them to say more without giving away the answer or writing for them.'
                  : isQuickExitTicket
                    ? 'Off by default for exit tickets.'
                    : isExitTicket
                      ? 'Off by default for an exit ticket: it checks what students understand on their own, and a tutor in the document would answer the question for them. Turn it on if you want them to have help.'
                      : "The tutor is on by default. Turning it off removes it from students' documents — the digital equivalent of an in-class essay. Assigning one now and then shows what a student can do unaided, and gives the Reporter a baseline to measure independent growth against."}
            </p>
            {isQuickExitTicket && !isV3ExitTicket && !isEditing ? (
              <div className="mt-1 pl-[calc(1rem+0.625rem)]">
                <WhyDisclosure>
                  <p>
                    An exit ticket checks what students understand on their own,
                    and a tutor in the document would answer the question for
                    them. Turn it on if you want them to have help.
                  </p>
                </WhyDisclosure>
              </div>
            ) : null}
          </div>

          {/* Graded for grammar and syntax. Shown only for assignment types whose
            rubric grades grammar, because the toggle only ever turns it off.
            Frozen after creation like the two toggles around it: work already
            graded was scored against a rubric that included the category, and
            flipping it afterwards would silently restate those grades. */}
          {selectedTypeGradesGrammar ? (
            <div className="pt-6">
              {isEditing ? null : (
                <BooleanFormValue
                  name="grammarGradingEnabled"
                  value={grammarGradingEnabled}
                />
              )}
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="assignment-create-grammar-grading-enabled"
                  checked={grammarGradingEnabled}
                  onCheckedChange={(checked) =>
                    setGrammarGradingEnabled(checked === true)
                  }
                  disabled={isSaving || isEditing}
                  className="size-4 shrink-0"
                />
                <Label
                  htmlFor="assignment-create-grammar-grading-enabled"
                  className={
                    isEditing
                      ? 'font-normal leading-none text-muted-foreground'
                      : 'cursor-pointer font-normal leading-none'
                  }
                >
                  Grade this for grammar and syntax
                </Label>
              </div>
              <p className="mt-1 pl-[calc(1rem+0.625rem)] text-sm text-muted-foreground">
                {isEditing
                  ? 'Grammar grading cannot be switched on or off after an assignment is created — work may already be graded against it.'
                  : 'On by default for this assignment type. Turn it off for a quick write you want graded on the thinking alone: the grammar category is dropped, the writing is not marked up, and the remaining categories carry the whole grade.'}
              </p>
            </div>
          ) : null}

          {/* Frozen after creation for assignments that were already
            collaborative: students may already have group drafts built around
            it. */}
          {showGroupProjectToggle ? (
            <div className="pt-6">
              {isEditing ? null : (
                <BooleanFormValue
                  name="collaborationEnabled"
                  value={collaborationEnabled}
                />
              )}
              {collaborationEnabled && !isEditing ? (
                <>
                  <input
                    type="hidden"
                    name="collaborationGroupMode"
                    value={collaborationGroupMode}
                  />
                  {collaborationModeNeedsGroupSize(collaborationGroupMode) ? (
                    <input
                      type="hidden"
                      name="collaborationGroupSize"
                      value={collaborationGroupSize}
                    />
                  ) : null}
                </>
              ) : null}
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="assignment-create-collaboration-enabled"
                  checked={collaborationEnabled}
                  onCheckedChange={(checked) =>
                    setCollaborationEnabled(checked === true)
                  }
                  disabled={isSaving || isEditing}
                  className="size-4 shrink-0"
                />
                <Label
                  htmlFor="assignment-create-collaboration-enabled"
                  className={
                    isEditing
                      ? 'font-normal leading-none text-muted-foreground'
                      : 'cursor-pointer font-normal leading-none'
                  }
                >
                  Group project
                </Label>
              </div>
              <p className="mt-1 pl-[calc(1rem+0.625rem)] text-sm text-muted-foreground">
                {isEditing
                  ? 'Collaboration cannot be switched on or off after an assignment is created — groups may already be writing in shared drafts.'
                  : 'Turn on for a collaborative document.'}
              </p>
            </div>
          ) : null}
        </MoreOptions>

        {SAVED_ASSIGNMENTS_ENABLED && usesBulkCreateApi && !isEditing ? (
          <div className="pt-6">
            <BooleanFormValue name="saveForReuse" value={saveForReuse} />
            <div className="flex items-center gap-2.5">
              <Checkbox
                id="assignment-create-save-for-reuse"
                checked={saveForReuse}
                onCheckedChange={(checked) => setSaveForReuse(checked === true)}
                disabled={isSaving}
                className="size-4 shrink-0"
              />
              <Label
                htmlFor="assignment-create-save-for-reuse"
                className="cursor-pointer font-normal leading-none"
              >
                Save to My Saved Assignments
              </Label>
            </div>
            <p className="mt-1 pl-[calc(1rem+0.625rem)] text-sm text-muted-foreground">
              Keep this assignment so you can give it to another class later
              without setting it up again.
            </p>
          </div>
        ) : null}

        {!submitForGrade ? (
          <input type="hidden" name="pointValue" value="" />
        ) : null}

        {formError ? (
          <p className="text-sm text-destructive">{formError}</p>
        ) : null}
        <div className="flex items-center justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving || isExtracting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitDisabled}>
            {isEditing
              ? isSaving
                ? 'Saving...'
                : 'Save Changes'
              : isSaving
                ? isDuplicateSheet
                  ? 'Duplicating...'
                  : 'Creating...'
                : isDuplicateSheet
                  ? 'Duplicate'
                  : 'Create Assignment'}
          </Button>
        </div>
      </CreateForm>
    </>
  );

  const successView = createdSuccess ? (
    <AssignmentCreatedSuccessPanel
      state={createdSuccess}
      onDone={() => {
        onOpenChange(false);
      }}
      onSetUpGroups={() => {
        const next = createdSuccess.nextStep;
        if (next) navigate(next.url);
      }}
    />
  ) : null;

  const sheetBody = successView ?? form;

  if (!renderSheet) {
    return <div>{sheetBody}</div>;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[520px]">
        {sheetBody}
      </SheetContent>
    </Sheet>
  );
}
