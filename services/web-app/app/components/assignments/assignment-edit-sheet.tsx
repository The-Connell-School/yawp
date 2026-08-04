import { useEffect, useMemo, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { FileUp, Loader2 } from 'lucide-react';
import {
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SHEET_SCROLL_BODY_CLASS_NAME,
  SHEET_STICKY_FOOTER_CLASS_NAME,
} from '~/components/ui/sheet';
import { cn } from '~/utils/misc';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';

export type AssignmentEditRecord = {
  id: string;
  title: string | null;
  prompt: string;
  promptAttachmentName?: string | null;
  submitForGrade: boolean;
  pointValue: number | null;
  assignmentTypeId: string;
  assignmentType: { id: string; title: string };
};

export type AssignmentEditFormProps = {
  /** Route to post the update-assignment intent to. Defaults to the current route. */
  action?: string;
  /** Class id used for PDF prompt extraction. */
  pdfClassId: string;
  allowedAssignmentTypes: { id: string; title: string }[];
  editingAssignment: AssignmentEditRecord;
  /** Called once the update-assignment submission succeeds. */
  onSaved: () => void;
  /** "Back to summary" — the caller decides whether to confirm discarding. */
  onBack: () => void;
  /** Reports whether the form differs from the assignment's saved values, so
   * the caller can guard against silently discarding in-progress edits when
   * switching modes or rows. */
  onDirtyChange: (dirty: boolean) => void;
};

/**
 * The assignment edit form — no Sheet/SheetContent wrapper of its own, since
 * it renders as one mode inside the shared assignment sheet (see
 * `class-assignments-tab.tsx`), alongside the view-mode summary content.
 */
export function AssignmentEditForm({
  action,
  pdfClassId,
  allowedAssignmentTypes,
  editingAssignment,
  onSaved,
  onBack,
  onDirtyChange,
}: AssignmentEditFormProps) {
  const fetcher = useFetcher<any>();
  const extractFetcher = useFetcher<any>();
  const [title, setTitle] = useState(editingAssignment.title ?? '');
  const [assignmentTypeId, setAssignmentTypeId] = useState(
    editingAssignment.assignmentTypeId
  );
  const [prompt, setPrompt] = useState(editingAssignment.prompt);
  const [submitForGrade, setSubmitForGrade] = useState(
    editingAssignment.submitForGrade ?? true
  );
  const [pointValue, setPointValue] = useState(
    (editingAssignment.pointValue ?? 100).toString()
  );
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentRemoved, setAttachmentRemoved] = useState(false);
  const [extractionTruncated, setExtractionTruncated] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const extractFileInputRef = useRef<HTMLInputElement>(null);

  const isSaving = fetcher.state !== 'idle';
  const isExtracting = extractFetcher.state !== 'idle';

  const formError = useMemo(() => {
    if (!fetcher.data || fetcher.data.success) return '';
    return fetcher.data.message || 'Unable to save assignment.';
  }, [fetcher.data]);

  const extractError = useMemo(() => {
    if (!extractFetcher.data || extractFetcher.data.success) return '';
    return extractFetcher.data.message || 'Unable to extract PDF content.';
  }, [extractFetcher.data]);

  const assignmentTypeOptions = useMemo(() => {
    if (
      allowedAssignmentTypes.some(
        (type) => type.id === editingAssignment.assignmentTypeId
      )
    ) {
      return allowedAssignmentTypes;
    }

    return [
      ...allowedAssignmentTypes,
      {
        id: editingAssignment.assignmentTypeId,
        title: `${editingAssignment.assignmentType.title} (archived)`,
      },
    ];
  }, [allowedAssignmentTypes, editingAssignment]);

  const isDirty =
    title !== (editingAssignment.title ?? '') ||
    assignmentTypeId !== editingAssignment.assignmentTypeId ||
    prompt !== editingAssignment.prompt ||
    Boolean(attachmentFile) ||
    attachmentRemoved ||
    submitForGrade !== (editingAssignment.submitForGrade ?? true) ||
    pointValue !== (editingAssignment.pointValue ?? 100).toString();

  useEffect(() => {
    onDirtyChange(isDirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

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

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      onSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const handleExtractPdf = (file: File) => {
    setExtractionTruncated(false);
    const formData = new FormData();
    formData.append('classId', pdfClassId);
    formData.append('file', file);
    extractFetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/assignment-pdf-extract',
      encType: 'multipart/form-data',
    });
  };

  return (
    <fetcher.Form
      method="post"
      action={action}
      encType="multipart/form-data"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className={cn(SHEET_SCROLL_BODY_CLASS_NAME, 'space-y-4 px-6 pt-6')}>
        <SheetHeader>
          <SheetTitle>Edit Assignment</SheetTitle>
          <SheetDescription>
            Configure the assignment prompt, grading, and due date.
          </SheetDescription>
        </SheetHeader>

        <input type="hidden" name="intent" value="update-assignment" />
        <input type="hidden" name="assignmentId" value={editingAssignment.id} />

        <div className="space-y-2">
          <Label htmlFor="assignment-title">Title (optional)</Label>
          <Input
            id="assignment-title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g., Rhetorical Analysis Essay"
            disabled={isSaving}
          />
        </div>

        <div className="space-y-2">
          <Label>Assignment Type</Label>
          <Select
            value={assignmentTypeId}
            onValueChange={setAssignmentTypeId}
            disabled={isSaving}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select assignment type" />
            </SelectTrigger>
            <SelectContent>
              {assignmentTypeOptions.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="hidden"
            name="assignmentTypeId"
            value={assignmentTypeId}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assignment-attachment">Attachment (optional)</Label>
          <p className="text-sm text-muted-foreground">
            Any documents uploaded here will be attached to the prompt and
            available to be viewed by students as they&apos;re working on their
            document.
          </p>

          {editingAssignment.promptAttachmentName && !attachmentRemoved ? (
            <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <span className="truncate">
                {editingAssignment.promptAttachmentName}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setAttachmentRemoved(true)}
                disabled={isSaving}
              >
                Remove
              </Button>
            </div>
          ) : (
            <>
              <Input
                id="assignment-attachment"
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
            </>
          )}
          {attachmentRemoved ? (
            <input type="hidden" name="removePromptAttachment" value="true" />
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="assignment-prompt">Prompt</Label>
          <div className="relative">
            <Textarea
              id="assignment-prompt"
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
              disabled={isExtracting || isSaving}
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

        <div className="space-y-3 rounded-md border p-3">
          <input type="hidden" name="submitForGrade" value="false" />
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="assignment-submit-for-grade"
              name="submitForGrade"
              value="true"
              checked={submitForGrade}
              onCheckedChange={(checked) => setSubmitForGrade(checked === true)}
              disabled={isSaving}
            />
            <div className="space-y-1">
              <Label
                htmlFor="assignment-submit-for-grade"
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
              <Label htmlFor="assignment-point-value">Point value</Label>
              <Input
                id="assignment-point-value"
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

        {formError ? (
          <p className="text-sm text-destructive">{formError}</p>
        ) : null}
      </div>

      <SheetFooter
        className={cn(
          SHEET_STICKY_FOOTER_CLASS_NAME,
          'flex-row justify-end sm:justify-end'
        )}
        data-testid="assignment-sheet-footer"
      >
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isSaving || isExtracting}
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={
            isSaving ||
            isExtracting ||
            !assignmentTypeId ||
            !prompt.trim() ||
            (submitForGrade && !pointValue.trim())
          }
        >
          {isSaving ? 'Saving...' : 'Save Assignment'}
        </Button>
      </SheetFooter>
    </fetcher.Form>
  );
}
