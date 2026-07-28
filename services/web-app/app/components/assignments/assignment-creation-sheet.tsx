import { useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import { useFetcher } from 'react-router';
import { CircleHelp } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
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
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  gradingAssistantStrictnessHelpText,
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
  grade?: string;
  period?: string;
};

type CreateFetcherData = {
  success?: boolean;
  message?: string;
};

type ExtractFetcherData = CreateFetcherData & {
  title?: string;
  prompt?: string;
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
  /**
   * A prompt the teacher already chose — a curated library entry or a prompt
   * they generated. The prompt is then shown as a read-only card in place of
   * the prompt-source controls, because the assignment is built from the
   * entry's stored snapshot rather than from typed text. Everything else about
   * the form (classes, title, grading) stays exactly as it is elsewhere.
   */
  lockedPrompt?: {
    label: string;
    title: string;
    body: string;
    badge?: string;
  } | null;
  /**
   * Extra hidden fields posted with the form, e.g. which library entry or saved
   * prompt the assignment is being built from.
   */
  extraHiddenFields?: Record<string, string>;
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
  if (klass.grade?.trim() && klass.period?.trim()) {
    return `Grade ${klass.grade} - Period ${klass.period}`;
  }
  return 'Class';
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
  lockedPrompt = null,
  extraHiddenFields,
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
  const [submitForGrade, setSubmitForGrade] = useState(true);
  const [pointValue, setPointValue] = useState('100');
  const [gradingAssistantStrictnessLevel, setGradingAssistantStrictnessLevel] =
    useState<GradingAssistantStrictnessLevel>(
      DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL
    );
  const [promptMode, setPromptMode] = useState<'manual' | 'pdf'>('manual');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
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
    setSubmitForGrade(true);
    setPointValue('100');
    setGradingAssistantStrictnessLevel(
      DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL
    );
    setPromptMode('manual');
    setPdfFile(null);
  }, [
    assignmentTypes,
    fixedAssignmentTypeId,
    initialAssignmentTypeId,
    fixedClassId,
    initialPrompt,
    initialTitle,
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
  }, [extractFetcher.data]);

  function toggleClass(classId: string) {
    if (hasFixedClass) return;
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  }

  function handleExtractPdf() {
    if (!pdfFile || !pdfExtractionClassId) return;
    const formData = new FormData();
    formData.append('classId', pdfExtractionClassId);
    formData.append('file', pdfFile);
    extractFetcher.submit?.(formData, {
      method: 'POST',
      action: '/api/domain/assignment-pdf-extract',
      encType: 'multipart/form-data',
    });
  }

  // A locked prompt carries its own text, so the textarea is not in play.
  const hasPromptText = lockedPrompt ? true : Boolean(prompt.trim());
  const isSubmitDisabled =
    isSaving ||
    isExtracting ||
    !assignmentTypeId ||
    selectedClassCount === 0 ||
    !hasPromptText ||
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

      <CreateForm method="post" action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="intent" value="create-assignment" />
        <input type="hidden" name="assignmentTypeId" value={assignmentTypeId} />
        {Object.entries(extraHiddenFields ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

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
          <Label htmlFor="assignment-create-title">Title (optional)</Label>
          <Input
            id="assignment-create-title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g., Rhetorical Analysis Essay"
            disabled={isSaving}
          />
        </div>

        {lockedPrompt ? null : (
        <div className="space-y-2">
          <Label>Prompt Source</Label>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={promptMode === 'manual'}
                onChange={() => setPromptMode('manual')}
              />
              Type manually
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={promptMode === 'pdf'}
                onChange={() => setPromptMode('pdf')}
              />
              Upload PDF
            </label>
          </div>
        </div>
        )}

        {!lockedPrompt && promptMode === 'pdf' ? (
          <div className="space-y-2 rounded-md border p-3">
            <Label htmlFor="assignment-create-pdf">Assignment PDF</Label>
            <Input
              id="assignment-create-pdf"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                setPdfFile(event.target.files?.[0] ?? null);
              }}
              disabled={isExtracting || isSaving}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleExtractPdf}
              disabled={
                !pdfFile || !pdfExtractionClassId || isExtracting || isSaving
              }
            >
              {isExtracting ? 'Extracting...' : 'Extract Prompt from PDF'}
            </Button>
            {extractError ? (
              <p className="text-sm text-destructive">{extractError}</p>
            ) : null}
          </div>
        ) : null}

        {lockedPrompt ? (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <Label>{lockedPrompt.label}</Label>
              {lockedPrompt.badge ? (
                <span className="text-xs font-medium uppercase text-muted-foreground">
                  {lockedPrompt.badge}
                </span>
              ) : null}
            </div>
            <h3 className="text-base font-semibold">{lockedPrompt.title}</h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {lockedPrompt.body}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="assignment-create-prompt">Prompt</Label>
            <Textarea
              id="assignment-create-prompt"
              name="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={8}
              placeholder="Paste or type the full assignment prompt for students..."
              disabled={isSaving}
              required
            />
          </div>
        )}

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

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Grading assistant strictness</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-full"
                          aria-label="Grading assistant strictness help"
                          title={gradingAssistantStrictnessHelpText}
                        >
                          <CircleHelp className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-80 rounded-md border-slate-200 bg-slate-100 p-3 text-sm text-slate-800 shadow-md"
                      >
                        {gradingAssistantStrictnessHelpText}
                      </PopoverContent>
                    </Popover>
                  </div>
                  <input
                    type="hidden"
                    name="gradingAssistantStrictnessLevel"
                    value={gradingAssistantStrictnessLevel}
                  />
                  <div className="grid gap-2 sm:grid-cols-3">
                    {gradingAssistantStrictnessOptions.map((option) => {
                      const selected =
                        gradingAssistantStrictnessLevel === option.value;
                      return (
                        <button
                          key={option.value}
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
              </div>
            </div>
          ) : null}
        </div>

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
