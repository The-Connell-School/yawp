import { useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import { useFetcher } from 'react-router';
import { FileUp, Loader2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
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
import { Switch } from '~/components/ui/switch';
import { Textarea } from '~/components/ui/textarea';
import { Tooltip } from '~/components/ui/tooltip';
import {
  DEFAULT_SAVED_ASSIGNMENT_POINT_VALUE,
  SAVED_ASSIGNMENTS_ENABLED,
} from '~/domain/assignments/saved-assignments';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  gradingAssistantStrictnessOptions,
  type GradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';

export type AssignmentCreationEntryPoint =
  | 'dashboard'
  | 'assignment-type'
  | 'class';

export type AssignmentCreationAssignmentType = {
  id: string;
  title: string;
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
  initialTitle?: string;
  initialPrompt?: string;
  emptyClassesMessage?: string;
  /** When true, a title must be entered before the assignment can be created. */
  titleRequired?: boolean;
  /**
   * Grading and tutor settings to start from. Reusing a saved assignment
   * carries its whole configuration back into the sheet, not just its prompt.
   */
  initialSubmitForGrade?: boolean;
  initialPointValue?: number | null;
  initialTutorEnabled?: boolean;
  initialGradingAssistantStrictnessLevel?: GradingAssistantStrictnessLevel;
};

type AssignmentCreationSheetContentProps = AssignmentCreationSheetProps & {
  createFetcher: AssignmentCreationFetcher<CreateFetcherData>;
  extractFetcher: AssignmentCreationFetcher<ExtractFetcherData>;
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

  return (
    <AssignmentCreationSheetContent
      {...props}
      createFetcher={createFetcher}
      extractFetcher={extractFetcher}
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
  initialTitle = '',
  initialPrompt = '',
  emptyClassesMessage = "You don't have any assignment-enabled classes yet.",
  titleRequired = false,
  initialSubmitForGrade = true,
  initialPointValue = DEFAULT_SAVED_ASSIGNMENT_POINT_VALUE,
  initialTutorEnabled = true,
  initialGradingAssistantStrictnessLevel = DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  createFetcher,
  extractFetcher,
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
  const [tutorEnabled, setTutorEnabled] = useState(initialTutorEnabled);
  const [saveForReuse, setSaveForReuse] = useState(false);
  const [gradingAssistantStrictnessLevel, setGradingAssistantStrictnessLevel] =
    useState<GradingAssistantStrictnessLevel>(
      initialGradingAssistantStrictnessLevel
    );
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [extractionTruncated, setExtractionTruncated] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const extractFileInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  const CreateForm = createFetcher.Form;
  const isSaving = createFetcher.state !== 'idle';
  const isExtracting = extractFetcher.state !== 'idle';
  const assignmentTypeId =
    fixedAssignmentTypeId ?? selectedAssignmentTypeId ?? '';
  const hasFixedClass = Boolean(fixedClassId);
  const usesBulkCreateApi =
    entryPoint === 'dashboard' || entryPoint === 'assignment-type';
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
    setTutorEnabled(initialTutorEnabled);
    setSaveForReuse(false);
    setGradingAssistantStrictnessLevel(initialGradingAssistantStrictnessLevel);
    setAttachmentFile(null);
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
    initialGradingAssistantStrictnessLevel,
    open,
    teacherClasses,
  ]);

  useEffect(() => {
    if (createFetcher.state === 'idle' && createFetcher.data?.success) {
      onOpenChange(false);
    }
  }, [createFetcher.state, createFetcher.data, onOpenChange]);

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
    selectedClassCount === 0 ||
    !prompt.trim() ||
    (titleRequired && !title.trim()) ||
    (submitForGrade && !pointValue.trim());

  const header = renderSheet ? (
    <SheetHeader>
      <SheetTitle>New Assignment</SheetTitle>
      <SheetDescription>
        Create an assignment for one or more of your classes.
      </SheetDescription>
    </SheetHeader>
  ) : (
    <div>
      <h2>New Assignment</h2>
      <p>Create an assignment for one or more of your classes.</p>
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
        <input type="hidden" name="intent" value="create-assignment" />
        <input type="hidden" name="assignmentTypeId" value={assignmentTypeId} />

        {hasFixedClass ? (
          <input type="hidden" name="classId" value={fixedClassId} />
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
            disabled={isSaving || Boolean(fixedAssignmentTypeId)}
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
        </div>

        <div className="space-y-2">
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

        <div className="space-y-2">
          <Label htmlFor="assignment-create-attachment">
            Attachment (optional)
          </Label>
          <p className="text-sm text-muted-foreground">
            Any documents uploaded here will be attached to the prompt and
            available to be viewed by students as they&apos;re working on
            their document.
          </p>
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

          {submitForGrade ? (
            <div className="mt-3 flex gap-2.5">
              <div className="flex w-4 shrink-0 justify-center">
                <div aria-hidden className="w-px bg-border" />
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="assignment-create-point-value">
                    Point value
                  </Label>
                  <Input
                    id="assignment-create-point-value"
                    name="pointValue"
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    inputMode="numeric"
                    value={pointValue}
                    onChange={(event) => setPointValue(event.target.value)}
                    disabled={isSaving}
                    required
                  />
                </div>

                <input
                  type="hidden"
                  name="gradingAssistantStrictnessLevel"
                  value={gradingAssistantStrictnessLevel}
                />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Grading assistant strictness</Label>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {gradingAssistantStrictnessOptions.map((option) => {
                      const selected =
                        gradingAssistantStrictnessLevel === option.value;
                      return (
                        <Tooltip
                          key={option.value}
                          text={option.description}
                          delayDuration={200}
                          contentProps={{ side: 'bottom', className: 'max-w-xs' }}
                        >
                          <button
                            type="button"
                            className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                              selected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-background hover:bg-muted'
                            }`}
                            aria-pressed={selected}
                            onClick={() =>
                              setGradingAssistantStrictnessLevel(option.value)
                            }
                            disabled={isSaving}
                          >
                            <span className="block font-medium">
                              {option.label}
                            </span>
                          </button>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="pt-6">
          <input type="hidden" name="tutorEnabled" value="false" />
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-base font-semibold text-foreground sm:text-sm">
              Turning the tutor off will remove the tutor from the
              student&apos;s documents.
            </p>
            <div className="mt-3 flex items-start justify-between gap-4">
              <Label
                htmlFor="assignment-create-tutor-enabled"
                className="min-w-0 flex-1 cursor-pointer text-base/7 font-normal text-muted-foreground sm:text-sm/6"
              >
                Do this if you want to test the student&apos;s ability to write
                a paper independently of tutor guidance.
              </Label>
              <Switch
                id="assignment-create-tutor-enabled"
                name="tutorEnabled"
                value="true"
                checked={tutorEnabled}
                onCheckedChange={setTutorEnabled}
                disabled={isSaving}
              />
            </div>
          </div>
        </div>

        {SAVED_ASSIGNMENTS_ENABLED && usesBulkCreateApi ? (
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

        {!submitForGrade ? <input type="hidden" name="pointValue" value="" /> : null}

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
            {isSaving ? 'Creating...' : 'Create Assignment'}
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
