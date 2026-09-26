import { useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import { useFetcher, useNavigate } from 'react-router';
import { FileUp, Loader2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  COLLABORATION_GROUP_MODE_OPTIONS,
  COLLABORATION_GROUP_SIZE_OPTIONS,
  DEFAULT_COLLABORATION_GROUP_MODE,
  DEFAULT_COLLABORATION_GROUP_SIZE,
  collaborationModeNeedsGroupSize,
  type CollaborationGroupMode,
} from '~/domain/assignments/collaboration';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Textarea } from '~/components/ui/textarea';
import {
  DEFAULT_SAVED_ASSIGNMENT_POINT_VALUE,
  SAVED_ASSIGNMENTS_ENABLED,
} from '~/domain/assignments/saved-assignments';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  gradingAssistantStrictnessOptions,
  type GradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import {
  DEFAULT_ASSIGNMENT_GRADING_MODE,
  gradingModeOptions,
  type AssignmentGradingMode,
} from '~/domain/assignments/rubric-overrides';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';
import { toDateInputValue } from '~/utils/date-only';

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

export type AssignmentCreationEntryPoint =
  'dashboard' | 'assignment-type' | 'class';

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
};

type CreateFetcherData = {
  success?: boolean;
  message?: string;
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
  entryPoint: AssignmentCreationEntryPoint;
  assignmentTypes: AssignmentCreationAssignmentType[];
  teacherClasses: AssignmentCreationClassOption[];
  fixedAssignmentTypeId?: string;
  initialAssignmentTypeId?: string;
  fixedClassId?: string;
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
  initialAssignmentTypeId?: string
) {
  return (
    fixedAssignmentTypeId ??
    initialAssignmentTypeId ??
    assignmentTypes[0]?.id ??
    ''
  );
}

function initialClassIds(fixedClassId?: string) {
  return fixedClassId ? [fixedClassId] : [];
}

/** The point-value input is a string; a saved assignment may carry none. */
function pointValueFieldValue(pointValue: number | null | undefined) {
  return pointValue === null || pointValue === undefined
    ? ''
    : String(pointValue);
}

export function AssignmentCreationSheet({
  ...props
}: AssignmentCreationSheetProps) {
  const createFetcher = useFetcher<CreateFetcherData>();
  const extractFetcher = useFetcher<ExtractFetcherData>();
  const navigate = useNavigate();

  return (
    <AssignmentCreationSheetContent
      {...props}
      createFetcher={createFetcher}
      extractFetcher={extractFetcher}
      navigate={navigate}
    />
  );
}

export function AssignmentCreationSheetContent({
  open,
  onOpenChange,
  entryPoint,
  assignmentTypes,
  teacherClasses,
  fixedAssignmentTypeId,
  initialAssignmentTypeId,
  fixedClassId,
  editingAssignment,
  initialTitle = '',
  initialPrompt = '',
  emptyClassesMessage = "You don't have any assignment-enabled classes yet.",
  titleRequired = false,
  initialSubmitForGrade = true,
  initialPointValue = DEFAULT_SAVED_ASSIGNMENT_POINT_VALUE,
  initialTutorEnabled = true,
  initialCollaborationEnabled = false,
  initialCollaborationGroupMode = DEFAULT_COLLABORATION_GROUP_MODE,
  initialCollaborationGroupSize = null,
  initialGradingAssistantStrictnessLevel = DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  initialRubricTotalPoints = null,
  initialGradingMode = DEFAULT_ASSIGNMENT_GRADING_MODE,
  initialPostAt,
  initialDueAt,
  createFetcher,
  extractFetcher,
  navigate = () => {},
  renderSheet = true,
}: AssignmentCreationSheetContentProps) {
  const [selectedAssignmentTypeId, setSelectedAssignmentTypeId] = useState(
    initialAssignmentTypeSelection(
      assignmentTypes,
      fixedAssignmentTypeId,
      initialAssignmentTypeId
    )
  );
  const [selectedClassId, setSelectedClassId] = useState(
    fixedClassId ?? teacherClasses[0]?.id ?? ''
  );
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(
    initialClassIds(fixedClassId)
  );
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [submitForGrade, setSubmitForGrade] = useState(initialSubmitForGrade);
  const [pointValue, setPointValue] = useState(
    pointValueFieldValue(initialPointValue)
  );
  const [postAt, setPostAt] = useState<string>('');
  const [dueAt, setDueAt] = useState<string>('');
  const [tutorEnabled, setTutorEnabled] = useState(initialTutorEnabled);
  const [grammarGradingEnabled, setGrammarGradingEnabled] = useState(true);
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
  const [gradingMode, setGradingMode] = useState<AssignmentGradingMode>(
    initialGradingMode
  );
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [extractionTruncated, setExtractionTruncated] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const extractFileInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  const isEditing = Boolean(editingAssignment);
  const [removeAttachment, setRemoveAttachment] = useState(false);

  const CreateForm = createFetcher.Form;
  const isSaving = createFetcher.state !== 'idle';
  const isExtracting = extractFetcher.state !== 'idle';
  const assignmentTypeId =
    fixedAssignmentTypeId ?? selectedAssignmentTypeId ?? '';
  const selectedTypeSupportsCollaboration = Boolean(assignmentTypeId);
  // Offered only where there is something to turn off. Switching it on cannot
  // invent a grammar category for a rubric that has none.
  const selectedTypeGradesGrammar = Boolean(
    assignmentTypes.find((type) => type.id === assignmentTypeId)?.gradesGrammar
  );
  const hasFixedClass = Boolean(fixedClassId);
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
  const selectedGradingMode = gradingModeOptions.find(
    (option) => option.value === gradingMode
  );
  const gradingModeLabel = selectedGradingMode?.label ?? '';
  const gradingModeDescription = selectedGradingMode?.description ?? '';

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
        initialAssignmentTypeId
      )
    );
    setSelectedClassId(fixedClassId ?? teacherClasses[0]?.id ?? '');
    setSelectedClassIds(initialClassIds(fixedClassId));
    setTitle(initialTitle);
    setPrompt(initialPrompt);
    setSubmitForGrade(initialSubmitForGrade);
    setPointValue(pointValueFieldValue(initialPointValue));
    setPostAt(toDateInputValue(initialPostAt));
    setDueAt(toDateInputValue(initialDueAt));
    setTutorEnabled(initialTutorEnabled);
    setCollaborationEnabled(initialCollaborationEnabled);
    setCollaborationGroupMode(initialCollaborationGroupMode);
    setCollaborationGroupSize(
      initialCollaborationGroupSize ?? DEFAULT_COLLABORATION_GROUP_SIZE
    );
    setSaveForReuse(false);
    setGradingAssistantStrictnessLevel(initialGradingAssistantStrictnessLevel);
    setGradingPanelOpen(false);
    setGradingMode(initialGradingMode);
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
    initialPostAt,
    initialDueAt,
    open,
    teacherClasses,
  ]);

  useEffect(() => {
    if (createFetcher.state !== 'idle' || !createFetcher.data?.success) return;
    onOpenChange(false);
    // Closing the sheet used to be the whole ending, which left a collaborative
    // assignment looking done while its groups did not exist yet. `navigate` is
    // injectable so this is testable without a router.
    const nextStep = createFetcher.data.nextStep;
    if (nextStep) navigate(nextStep.url);
  }, [createFetcher.state, createFetcher.data, onOpenChange, navigate]);

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
    (!isEditing && selectedClassCount === 0) ||
    !prompt.trim() ||
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

  const form = (
    <>
      {header}

      <CreateForm
        method="post"
        action={formAction}
        encType="multipart/form-data"
        className="mt-6 space-y-4"
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
          <Label>Assignment type</Label>
          <Select
            value={assignmentTypeId}
            onValueChange={setSelectedAssignmentTypeId}
            disabled={
              isSaving ||
              Boolean(fixedAssignmentTypeId) ||
              Boolean(editingAssignment?.assignmentTypeLocked)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an assignment type" />
            </SelectTrigger>
            <SelectContent>
              {assignmentTypes.map((assignmentType) => (
                <SelectItem key={assignmentType.id} value={assignmentType.id}>
                  {assignmentType.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {editingAssignment?.assignmentTypeLocked ? (
            <p className="text-xs text-muted-foreground">
              Assignment type is fixed because shared group drafts already
              exist.
            </p>
          ) : null}
        </div>

        <div className={isEditing ? 'hidden' : 'space-y-2'}>
          <Label>Assign to</Label>
          <div className="space-y-2.5 rounded-md border p-3">
            {teacherClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {emptyClassesMessage}
              </p>
            ) : (
              teacherClasses.map((klass) => {
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

        <div className="space-y-2">
          <Label htmlFor="assignment-create-attachment">
            Attachment (optional)
          </Label>
          <p className="text-sm text-muted-foreground">
            Any documents uploaded here will be attached to the prompt and
            available to be viewed by students as they&apos;re working on their
            document.
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

        <div className="pt-6">
          <input type="hidden" name="submitForGrade" value="false" />
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="assignment-create-submit-for-grade"
              name="submitForGrade"
              value="true"
              checked={submitForGrade}
              onCheckedChange={(checked) => setSubmitForGrade(checked === true)}
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

          {submitForGrade ? (
            <div className="mt-3 overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Graded out of{' '}
                  <span className="font-medium text-foreground">
                    {pointValue || '—'} points
                  </span>{' '}
                  in{' '}
                  <span className="font-medium text-foreground">
                    {gradingMode === 'bands' ? 'bands' : 'steps'}
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
                          min={1}
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
                      What the assignment is worth in the gradebook. The rubric
                      keeps its own scale either way.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p
                      id="assignment-create-scoring-behavior"
                      className="text-sm font-medium"
                    >
                      Scoring behavior
                    </p>
                    <GradingChoiceGroup
                      labelId="assignment-create-scoring-behavior"
                      idPrefix="assignment-create-grading-mode"
                      value={gradingMode}
                      options={gradingModeOptions}
                      onChange={setGradingMode}
                      disabled={isSaving}
                    />
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {gradingModeLabel}
                      </span>{' '}
                      — {gradingModeDescription}
                    </p>
                  </div>

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
              ) : (
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
              <input type="hidden" name="gradingMode" value={gradingMode} />
              <input
                type="hidden"
                name="gradingAssistantStrictnessLevel"
                value={gradingAssistantStrictnessLevel}
              />
            </div>
          ) : null}
        </div>

        {/* Frozen once the assignment exists: students may already have
            documents and tutor sessions built around this setting, so it is
            shown read-only rather than hidden. Nothing named tutorEnabled is
            submitted while editing, which is what tells the server to leave
            the stored value alone. */}
        <div className="pt-6">
          {isEditing ? null : (
            <input type="hidden" name="tutorEnabled" value="false" />
          )}
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="assignment-create-tutor-enabled"
              name={isEditing ? undefined : 'tutorEnabled'}
              value="true"
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
          </div>
          <p className="mt-1 pl-[calc(1rem+0.625rem)] text-sm text-muted-foreground">
            {isEditing
              ? 'The tutor cannot be switched on or off after an assignment is created — students may already be working with it. Duplicate the assignment to give a class a version with the other setting.'
              : "Turning the tutor off removes it from students' documents. Do this to test a student's ability to write a paper independently of tutor guidance."}
          </p>
        </div>

        {/* Graded for grammar and syntax. Shown only for assignment types whose
            rubric grades grammar, because the toggle only ever turns it off.
            Frozen after creation like the two toggles around it: work already
            graded was scored against a rubric that included the category, and
            flipping it afterwards would silently restate those grades. */}
        {selectedTypeGradesGrammar ? (
          <div className="pt-6">
            {isEditing ? null : (
              <input
                type="hidden"
                name="grammarGradingEnabled"
                value="false"
              />
            )}
            <div className="flex items-center gap-2.5">
              <Checkbox
                id="assignment-create-grammar-grading-enabled"
                name={isEditing ? undefined : 'grammarGradingEnabled'}
                value="true"
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

        {/* Collaborative drafts. Available for every assignment type, and frozen
            after creation for the same reason the tutor toggle is: students may
            already have group drafts built around it.
            Group membership itself is arranged per class afterwards, because an
            assignment fans out to one ClassAssignment per class. */}
        {selectedTypeSupportsCollaboration ? (
          <div className="pt-6">
            {isEditing ? null : (
              <input type="hidden" name="collaborationEnabled" value="false" />
            )}
            <div className="flex items-center gap-2.5">
              <Checkbox
                id="assignment-create-collaboration-enabled"
                name={isEditing ? undefined : 'collaborationEnabled'}
                value="true"
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
                Is this a collaborative assignment?
              </Label>
            </div>
            <p className="mt-1 pl-[calc(1rem+0.625rem)] text-sm text-muted-foreground">
              {isEditing
                ? 'Collaboration cannot be switched on or off after an assignment is created — groups may already be writing in shared drafts.'
                : 'You must assign every student to a group before students can open this assignment. You can arrange groups yourself, shuffle automatically, or use the whole class. Students cannot create groups, move themselves, or create shared documents. When you finalize the groups, Yawp creates one shared document for each group.'}
            </p>
            {collaborationEnabled && !isEditing ? (
              <div className="mt-3 space-y-3 pl-[calc(1rem+0.625rem)]">
                <input
                  type="hidden"
                  name="collaborationGroupMode"
                  value={collaborationGroupMode}
                />
                <div className="space-y-2">
                  <Label>How should groups be made?</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {COLLABORATION_GROUP_MODE_OPTIONS.map((option) => {
                      const selected = collaborationGroupMode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`h-full rounded-md border px-3 py-2 text-left text-sm transition ${
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background hover:bg-muted'
                          }`}
                          aria-pressed={selected}
                          onClick={() =>
                            setCollaborationGroupMode(option.value)
                          }
                          disabled={isSaving}
                        >
                          <span className="block font-medium">
                            {option.label}
                          </span>
                          <span
                            className={`mt-1 block text-xs ${
                              selected
                                ? 'text-primary-foreground/80'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {option.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Whole class has no size to choose: the group is the roster. */}
                {collaborationModeNeedsGroupSize(collaborationGroupMode) ? (
                  <div>
                    <Label
                      htmlFor="assignment-create-collaboration-group-size"
                      className="font-normal leading-none"
                    >
                      Students per group
                    </Label>
                    <select
                      id="assignment-create-collaboration-group-size"
                      name="collaborationGroupSize"
                      value={collaborationGroupSize}
                      onChange={(event) =>
                        setCollaborationGroupSize(Number(event.target.value))
                      }
                      disabled={isSaving}
                      className="mt-1 block rounded border px-2 py-1 text-sm"
                    >
                      {COLLABORATION_GROUP_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {SAVED_ASSIGNMENTS_ENABLED && usesBulkCreateApi && !isEditing ? (
          <div className="pt-6">
            <input type="hidden" name="saveForReuse" value="false" />
            <div className="flex items-center gap-2.5">
              <Checkbox
                id="assignment-create-save-for-reuse"
                name="saveForReuse"
                value="true"
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
                ? 'Creating...'
                : 'Create Assignment'}
          </Button>
        </div>
      </CreateForm>
    </>
  );

  if (!renderSheet) {
    return <div>{form}</div>;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {form}
      </SheetContent>
    </Sheet>
  );
}
