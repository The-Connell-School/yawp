import { useEffect, useMemo, useState } from 'react';
import { useFetcher } from 'react-router';
import { Copy } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
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
  submitForGrade: boolean;
  pointValue: number | null;
  assignmentTypeId: string;
  assignmentType: { id: string; title: string };
};

export type AssignmentEditSheetProps = {
  /** Route to post the update-assignment intent to. Defaults to the current route. */
  action?: string;
  /** Class id used for PDF prompt extraction. */
  pdfClassId: string;
  allowedAssignmentTypes: { id: string; title: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAssignment: AssignmentEditRecord;
  /** Renders a Duplicate action in the footer when provided. */
  onDuplicate?: () => void;
};

export function AssignmentEditSheet({
  action,
  pdfClassId,
  allowedAssignmentTypes,
  open,
  onOpenChange,
  editingAssignment,
  onDuplicate,
}: AssignmentEditSheetProps) {
  const fetcher = useFetcher<any>();
  const extractFetcher = useFetcher<any>();
  const [title, setTitle] = useState('');
  const [assignmentTypeId, setAssignmentTypeId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [submitForGrade, setSubmitForGrade] = useState(true);
  const [pointValue, setPointValue] = useState('100');
  const [promptMode, setPromptMode] = useState<'manual' | 'pdf'>('manual');
  const [pdfFile, setPdfFile] = useState<File | null>(null);

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

  useEffect(() => {
    if (!open) return;
    setTitle(editingAssignment.title ?? '');
    setAssignmentTypeId(editingAssignment.assignmentTypeId);
    setPrompt(editingAssignment.prompt);
    setSubmitForGrade(editingAssignment.submitForGrade ?? true);
    setPointValue((editingAssignment.pointValue ?? 100).toString());
    setPromptMode('manual');
    setPdfFile(null);
  }, [editingAssignment, open]);

  useEffect(() => {
    if (!extractFetcher.data?.success) return;

    if (typeof extractFetcher.data.title === 'string') {
      setTitle(extractFetcher.data.title);
    }
    if (typeof extractFetcher.data.prompt === 'string') {
      setPrompt(extractFetcher.data.prompt);
    }
  }, [extractFetcher.data]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      onOpenChange(false);
    }
  }, [fetcher.state, fetcher.data, onOpenChange]);

  const handleExtractPdf = () => {
    if (!pdfFile) return;
    const formData = new FormData();
    formData.append('classId', pdfClassId);
    formData.append('file', pdfFile);
    extractFetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/assignment-pdf-extract',
      encType: 'multipart/form-data',
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Edit Assignment</SheetTitle>
          <SheetDescription>
            Configure the assignment prompt, grading, and due date.
          </SheetDescription>
        </SheetHeader>

        <fetcher.Form method="post" action={action} className="mt-6 space-y-4">
          <input type="hidden" name="intent" value="update-assignment" />
          <input
            type="hidden"
            name="assignmentId"
            value={editingAssignment.id}
          />

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
              <Label htmlFor="assignment-pdf">Assignment PDF</Label>
              <Input
                id="assignment-pdf"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setPdfFile(nextFile);
                }}
                disabled={isExtracting || isSaving}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleExtractPdf}
                disabled={!pdfFile || isExtracting || isSaving}
              >
                {isExtracting ? 'Extracting…' : 'Extract Prompt from PDF'}
              </Button>
              {extractError ? (
                <p className="text-sm text-destructive">{extractError}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="assignment-prompt">Prompt</Label>
            <Textarea
              id="assignment-prompt"
              name="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={8}
              placeholder="Paste or type the full assignment prompt for students..."
              disabled={isSaving}
              required
            />
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

          <div className="flex items-center justify-between gap-2 pt-4">
            {onDuplicate ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onDuplicate}
                disabled={isSaving || isExtracting}
              >
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving || isExtracting}
              >
                Cancel
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
            </div>
          </div>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
}
