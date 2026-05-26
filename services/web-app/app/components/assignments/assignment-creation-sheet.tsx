import { useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import { useFetcher } from 'react-router';
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
import { Textarea } from '~/components/ui/textarea';

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
  assignmentCreationStandardizationEnabled: boolean;
  fixedAssignmentTypeId?: string;
  fixedClassId?: string;
  initialPrompt?: string;
  emptyClassesMessage?: string;
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

function firstAssignmentTypeId(
  assignmentTypes: AssignmentCreationAssignmentType[],
  fixedAssignmentTypeId?: string
) {
  return fixedAssignmentTypeId ?? assignmentTypes[0]?.id ?? '';
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
  assignmentCreationStandardizationEnabled,
  fixedAssignmentTypeId,
  fixedClassId,
  initialPrompt = '',
  emptyClassesMessage = "You don't have any assignment-enabled classes yet.",
  createFetcher,
  extractFetcher,
  renderSheet = true,
}: AssignmentCreationSheetContentProps) {
  const [selectedAssignmentTypeId, setSelectedAssignmentTypeId] = useState(
    firstAssignmentTypeId(assignmentTypes, fixedAssignmentTypeId)
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
  const [dueDate, setDueDate] = useState('');
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
    entryPoint === 'dashboard' ||
    (entryPoint === 'assignment-type' &&
      assignmentCreationStandardizationEnabled);
  const usesLegacySingleClassRoute =
    entryPoint === 'assignment-type' &&
    !assignmentCreationStandardizationEnabled;
  const formAction = usesBulkCreateApi
    ? '/api/assignments/create'
    : usesLegacySingleClassRoute && selectedClassId
      ? `/app/my-classes/${selectedClassId}`
      : undefined;
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
      firstAssignmentTypeId(assignmentTypes, fixedAssignmentTypeId)
    );
    setSelectedClassId(fixedClassId ?? teacherClasses[0]?.id ?? '');
    setSelectedClassIds(initialClassIds(fixedClassId));
    setTitle('');
    setPrompt(initialPrompt);
    setSubmitForGrade(true);
    setPointValue('100');
    setDueDate('');
    setPromptMode('manual');
    setPdfFile(null);
  }, [
    assignmentTypes,
    fixedAssignmentTypeId,
    fixedClassId,
    initialPrompt,
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

  const isSubmitDisabled =
    isSaving ||
    isExtracting ||
    !assignmentTypeId ||
    selectedClassCount === 0 ||
    !prompt.trim() ||
    (assignmentCreationStandardizationEnabled &&
      submitForGrade &&
      !pointValue.trim());

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

        {hasFixedClass ? (
          <input type="hidden" name="classId" value={fixedClassId} />
        ) : usesBulkCreateApi ? (
          selectedClassIds.map((id) => (
            <input key={id} type="hidden" name="classIds" value={id} />
          ))
        ) : (
          <input type="hidden" name="classId" value={selectedClassId} />
        )}

        {assignmentCreationStandardizationEnabled ? (
          <input type="hidden" name="submitForGrade" value="false" />
        ) : null}

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
          {usesLegacySingleClassRoute && !hasFixedClass ? (
            <Select
              value={selectedClassId}
              onValueChange={setSelectedClassId}
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {teacherClasses.map((klass) => (
                  <SelectItem key={klass.id} value={klass.id}>
                    {assignmentCreationClassLabel(klass)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
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
          )}
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

        {promptMode === 'pdf' ? (
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

        {assignmentCreationStandardizationEnabled ? (
          <>
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="assignment-create-submit-for-grade"
                  name="submitForGrade"
                  value="true"
                  checked={submitForGrade}
                  onCheckedChange={(checked) =>
                    setSubmitForGrade(checked === true)
                  }
                  disabled={isSaving}
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="assignment-create-submit-for-grade"
                    className="cursor-pointer font-normal"
                  >
                    Submit for grade
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Students can submit this assignment for a recorded grade.
                  </p>
                </div>
              </div>

              {submitForGrade ? (
                <div className="space-y-2 pl-6">
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
              ) : null}
            </div>

            {!submitForGrade ? (
              <input type="hidden" name="pointValue" value="" />
            ) : null}
          </>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="assignment-create-due-date">
            Due Date (optional)
          </Label>
          <Input
            id="assignment-create-due-date"
            type="date"
            name="dueDate"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            disabled={isSaving}
          />
        </div>

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
